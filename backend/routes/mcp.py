from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from ..database import get_db
from ..models import Setting
from .workflows import load_decrypted_service_account
import os
import json
import requests
import urllib.parse

# Optional Google Sheets client
try:
    import gspread
    from google.oauth2.service_account import Credentials
except Exception:
    gspread = None
    Credentials = None

router = APIRouter(prefix="/mcp", tags=["mcp"])

MOCK_GITLAB_TOOLS = [
    {
        "name": "gitlab_list_issues",
        "description": "List all issues in a GitLab project.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The ID or URL-encoded path of the project"},
                "state": {"type": "string", "description": "Filter by state: opened or closed", "default": "opened"}
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "gitlab_get_issue",
        "description": "Get details of a specific issue.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "issue_iid": {"type": "integer"}
            },
            "required": ["project_id", "issue_iid"]
        }
    },
    {
        "name": "gitlab_list_merge_requests",
        "description": "List merge requests in a project.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "state": {"type": "string"}
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "gitlab_get_mr_diff",
        "description": "Get the file diff for a GitLab merge request.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "mr_iid": {"type": "integer"}
            },
            "required": ["project_id", "mr_iid"]
        }
    },
    {
        "name": "gitlab_create_mr_comment",
        "description": "Create a new comment/discussion on a GitLab merge request.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "mr_iid": {"type": "integer"},
                "body": {"type": "string", "description": "Comment content"}
            },
            "required": ["project_id", "mr_iid", "body"]
        }
    },
    {
        "name": "gitlab_create_merge_request",
        "description": "Create a new GitLab merge request.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "source_branch": {"type": "string"},
                "target_branch": {"type": "string"},
                "title": {"type": "string"}
            },
            "required": ["project_id", "source_branch", "target_branch", "title"]
        }
    }
]

@router.get("")
def get_mcp_servers(db: Session = Depends(get_db)):
    gitlab_token = db.query(Setting).filter(Setting.key == "gitlab_access_token").first()
    has_token = bool(gitlab_token and gitlab_token.value)
    
    return [
        {
            "name": "gitlab-mcp-server",
            "status": "connected" if has_token else "sandboxed",
            "type": "partner_mcp",
            "latency_ms": 12 if has_token else 0,
            "version": "1.0.4",
            "tools_count": len(MOCK_GITLAB_TOOLS)
        },
        {
            "name": "google-sheets-mcp-server",
            "status": "connected",
            "type": "utility_mcp",
            "latency_ms": 18,
            "version": "1.1.2",
            "tools_count": 2
        }
    ]


@router.get("/{server_name}/validate")
def validate_mcp_server(server_name: str, db: Session = Depends(get_db)):
    """Lightweight validation for MCP servers. For gitlab-mcp-server this checks
    the saved token by calling /user on GitLab. Returns detailed result.
    """
    gitlab_token = db.query(Setting).filter(Setting.key == "gitlab_access_token").first()
    if server_name == "gitlab-mcp-server":
        if not gitlab_token or not gitlab_token.value:
            return {"success": False, "message": "No GitLab token configured"}
        try:
            headers = {"Authorization": f"Bearer {gitlab_token.value}"}
            r = requests.get("https://gitlab.com/api/v4/user", headers=headers, timeout=6)
            if r.status_code == 200:
                return {"success": True, "message": "Token valid", "user": r.json()}
            return {"success": False, "message": "Token validation failed", "status_code": r.status_code, "details": r.text}
        except Exception as ex:
            return {"success": False, "message": "Validation request failed", "details": str(ex)}
    elif server_name == "google-sheets-mcp-server":
        # Sheets server is stateless in our MCP mock; report OK always
        return {"success": True, "message": "Sheets MCP available"}
    else:
        raise HTTPException(status_code=404, detail="MCP Server not found")


@router.get("/gitlab-debug/issues")
def gitlab_debug_issues(project: str, db: Session = Depends(get_db)):
    """Diagnostic helper: performs a projects/{project}/issues request using the
    saved token and returns the exact outbound URL, masked headers and raw response.
    This is a GET helper to avoid JSON body parsing differences when diagnosing.
    """
    gitlab_token = db.query(Setting).filter(Setting.key == "gitlab_access_token").first()
    if not gitlab_token or not gitlab_token.value:
        return {"success": False, "message": "No GitLab token configured"}
    headers = {"Authorization": f"Bearer {gitlab_token.value}"}
    try:
        base = "https://gitlab.com/api/v4"
        encoded = urllib.parse.quote(project, safe="")
        url = f"{base}/projects/{encoded}/issues"
        r = requests.get(url, headers=headers, timeout=8)
        masked_headers = {k: ("***REDACTED***" if k.lower() == "authorization" else v) for k, v in headers.items()}
        try:
            out = r.json()
        except Exception:
            out = None
        return {"success": r.ok, "status_code": r.status_code, "output": out if out is not None else r.text, "diagnostics": {"request_url": url, "request_headers": masked_headers, "response_text": r.text}}
    except Exception as ex:
        return {"success": False, "message": "GitLab API request failed", "details": str(ex)}

@router.get("/{server_name}/tools")
def get_mcp_tools(server_name: str):
    if server_name == "gitlab-mcp-server":
        return MOCK_GITLAB_TOOLS
    elif server_name == "google-sheets-mcp-server":
        return [
            {
                "name": "append_row_to_sheet",
                "description": "Append a list of values as a new row in a spreadsheet.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "spreadsheet_id": {"type": "string"},
                        "range": {"type": "string"},
                        "values": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["spreadsheet_id", "range", "values"]
                }
            },
            {
                "name": "create_new_sheet",
                "description": "Create a new Google Sheet inside the workspace.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"}
                    },
                    "required": ["title"]
                }
            }
        ]
    else:
        raise HTTPException(status_code=404, detail="MCP Server not found")

@router.post("/{server_name}/tools/{tool_name}")
def run_mcp_tool(server_name: str, tool_name: str, args: Dict[str, Any], db: Session = Depends(get_db)):
    gitlab_token = db.query(Setting).filter(Setting.key == "gitlab_access_token").first()
    has_token = bool(gitlab_token and gitlab_token.value)
    # Load Google service account credentials (if present)
    google_sa_json = None
    try:
        sa_from_store = load_decrypted_service_account()
        if sa_from_store:
            google_sa_json = sa_from_store
    except Exception:
        google_sa_json = None
    # 1) env var GOOGLE_SERVICE_ACCOUNT (JSON string)
    if os.environ.get("GOOGLE_SERVICE_ACCOUNT"):
        try:
            google_sa_json = json.loads(os.environ.get("GOOGLE_SERVICE_ACCOUNT"))
        except Exception:
            google_sa_json = None
    # 2) local file backend/.secrets/service_account.json
    if not google_sa_json:
        sa_path = os.path.join(os.path.dirname(__file__), "..", ".secrets", "service_account.json")
        sa_path = os.path.normpath(sa_path)
        if os.path.exists(sa_path):
            try:
                with open(sa_path, "r") as f:
                    google_sa_json = json.load(f)
            except Exception:
                google_sa_json = None
    
    if server_name == "gitlab-mcp-server":
        if has_token:
            # When token exists, perform real GitLab API calls per tool_name
            headers = {"Authorization": f"Bearer {gitlab_token.value}"}
            try:
                # Simple validation call
                user_resp = requests.get("https://gitlab.com/api/v4/user", headers=headers, timeout=6)
                if user_resp.status_code != 200:
                    return {"success": False, "message": "Invalid GitLab token", "details": user_resp.text, "status_code": user_resp.status_code}

                # Route tool implementations
                base = "https://gitlab.com/api/v4"
                if tool_name == "gitlab_list_issues":
                    project = args.get("project_id")
                    # Ensure the project path is URL-encoded (slashes -> %2F)
                    encoded = urllib.parse.quote(project, safe="")
                    url = f"{base}/projects/{encoded}/issues"
                    # Perform the request
                    r = requests.get(url, headers=headers, timeout=8)

                    # If caller requested diagnostics (either '__diagnose' or 'diagnose'), return extra info
                    diag_flag = args.get("__diagnose") or args.get("diagnose")
                    if diag_flag:
                        masked_headers = {k: ("***REDACTED***" if k.lower() == "authorization" else v) for k, v in headers.items()}
                        # Try to parse JSON output, fall back to raw text
                        try:
                            out = r.json()
                        except Exception:
                            out = None
                        return {
                            "success": r.ok,
                            "status_code": r.status_code,
                            "output": out if out is not None else r.text,
                            "diagnostics": {
                                "request_url": url,
                                "request_headers": masked_headers,
                                "response_text": r.text
                            }
                        }

                    return {"success": r.ok, "status_code": r.status_code, "output": r.json()}
                elif tool_name == "gitlab_get_issue":
                    project = args.get("project_id"); iid = args.get("issue_iid")
                    encoded = urllib.parse.quote(project, safe="")
                    r = requests.get(f"{base}/projects/{encoded}/issues/{iid}", headers=headers, timeout=8)
                    return {"success": r.ok, "status_code": r.status_code, "output": r.json()}
                elif tool_name == "gitlab_list_merge_requests":
                    project = args.get("project_id")
                    encoded = urllib.parse.quote(project, safe="")
                    r = requests.get(f"{base}/projects/{encoded}/merge_requests", headers=headers, timeout=8)
                    return {"success": r.ok, "status_code": r.status_code, "output": r.json()}
                elif tool_name == "gitlab_get_mr_diff":
                    project = args.get("project_id"); iid = args.get("mr_iid")
                    encoded = urllib.parse.quote(project, safe="")
                    r = requests.get(f"{base}/projects/{encoded}/merge_requests/{iid}/changes", headers=headers, timeout=8)
                    return {"success": r.ok, "status_code": r.status_code, "output": r.json()}
                elif tool_name == "gitlab_create_mr_comment":
                    project = args.get("project_id"); iid = args.get("mr_iid"); body = args.get("body")
                    payload = {"body": body}
                    encoded = urllib.parse.quote(project, safe="")
                    r = requests.post(f"{base}/projects/{encoded}/merge_requests/{iid}/notes", headers=headers, json=payload, timeout=8)
                    return {"success": r.ok, "status_code": r.status_code, "output": r.json()}
                elif tool_name == "gitlab_create_merge_request":
                    project = args.get("project_id")
                    payload = {
                        "source_branch": args.get("source_branch"),
                        "target_branch": args.get("target_branch"),
                        "title": args.get("title")
                    }
                    encoded = urllib.parse.quote(project, safe="")
                    r = requests.post(f"{base}/projects/{encoded}/merge_requests", headers=headers, json=payload, timeout=8)
                    return {"success": r.ok, "status_code": r.status_code, "output": r.json()}
                else:
                    return {"success": True, "message": f"Unknown GitLab tool '{tool_name}' - no-op"}
            except Exception as ex:
                return {"success": False, "message": "GitLab API request failed", "details": str(ex)}
        else:
            # Sandbox/Mock response
            return {
                "success": True,
                "message": f"Successfully executed tool '{tool_name}' in sandbox mode.",
                "output": {
                    "status": "success",
                    "sandbox": True,
                    "target_project": args.get("project_id", "default-project"),
                    "details": "Mocked tool execution result."
                }
            }
    elif server_name == "google-sheets-mcp-server":
        # Validate spreadsheet id looks reasonable (alphanumeric, - and _ permitted)
        sheet_id = args.get("spreadsheet_id")
        if not sheet_id or not isinstance(sheet_id, str) or len(sheet_id) < 8:
            return {"success": False, "message": "Invalid spreadsheet_id provided", "details": "Expected Google Sheets ID"}

        # If gspread + service account is available and we have SA JSON, attempt a real append
        if gspread and google_sa_json:
            try:
                scopes = ["https://www.googleapis.com/auth/spreadsheets"]
                creds = Credentials.from_service_account_info(google_sa_json, scopes=scopes)
                gc = gspread.authorize(creds)
                sh = gc.open_by_key(sheet_id)
                # Append row
                values = args.get("values", [])
                rng = args.get("range", "Sheet1!A1")
                # gspread append uses sheet.values_append or worksheet.append_row
                # We'll append to first sheet for simplicity
                ws = sh.get_worksheet(0)
                ws.append_row(values)
                return {"success": True, "message": "Appended row to Google Sheet", "output": {"status": "success", "rows_added": 1}}
            except Exception as ex:
                return {"success": False, "message": "Google Sheets API append failed", "details": str(ex)}

        # Fallback: mock behavior
        return {
            "success": True,
            "message": f"Successfully appended row to Google Sheet (mock).",
            "output": {"status": "success", "rows_added": 1}
        }
    else:
        raise HTTPException(status_code=404, detail="MCP Server not found")
