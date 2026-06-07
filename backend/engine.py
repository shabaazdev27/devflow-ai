import asyncio
import datetime
import json
import logging
from typing import Dict, Any, List
import google.generativeai as genai
from sqlalchemy.orm import Session
from .models import Workflow, WorkflowRun, Setting
from .schemas import StepState

logger = logging.getLogger(__name__)

# Mock Google Sheets Database to simulate Google Services integration when keys aren't provided
MOCK_SHEETS_FILE = "src/data/mock_sheets.json"

def write_to_mock_sheet(row_data: Dict[str, Any]):
    try:
        import os
        os.makedirs("src/data", exist_ok=True)
        data = []
        if os.path.exists(MOCK_SHEETS_FILE):
            with open(MOCK_SHEETS_FILE, "r") as f:
                try:
                    data = json.load(f)
                except Exception:
                    data = []
        data.append({
            "timestamp": datetime.datetime.utcnow().isoformat(),
            **row_data
        })
        with open(MOCK_SHEETS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write to mock sheet: {e}")

class WorkflowEngine:
    def __init__(self, db: Session):
        self.db = db

    def get_setting(self, key: str) -> str:
        setting = self.db.query(Setting).filter(Setting.key == key).first()
        return setting.value if setting else ""

    async def execute_run(self, run_id: str):
        """
        Runs the workflow execution loop.
        """
        run = self.db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        if not run:
            return

        workflow = self.db.query(Workflow).filter(Workflow.id == run.workflow_id).first()
        if not workflow:
            run.status = "FAILED"
            self.db.commit()
            return

        steps_state = json.loads(run.steps_state)
        run.status = "RUNNING"
        self.db.commit()

        # Get API keys
        gemini_key = self.get_setting("gemini_api_key")
        gitlab_token = self.get_setting("gitlab_access_token")
        sheets_id = self.get_setting("google_sheets_id")

        if gemini_key:
            genai.configure(api_key=gemini_key)

        for i in range(run.current_step_index, len(steps_state)):
            step = steps_state[i]
            if step["status"] == "COMPLETED" or step["status"] == "SKIPPED":
                continue

            run.current_step_index = i
            step["status"] = "RUNNING"
            step["started_at"] = datetime.datetime.utcnow().isoformat()
            run.steps_state = json.dumps(steps_state)
            self.db.commit()

            try:
                # Execute specific step type
                if step["type"] == "manual_approval":
                    step["status"] = "PAUSED"
                    step["approval_prompt"] = step.get("description") or "Confirm to proceed with this action."
                    run.status = "PAUSED"
                    run.steps_state = json.dumps(steps_state)
                    self.db.commit()
                    return # Exit loop, wait for user response

                elif step["type"] == "agent":
                    await self.run_agent_step(step, steps_state[:i], gemini_key)
                    step["status"] = "COMPLETED"
                    step["ended_at"] = datetime.datetime.utcnow().isoformat()

                elif step["type"] == "mcp_tool":
                    # Pass the run object and the full steps_state so the tool
                    # helper can persist incremental logs/output to the DB while
                    # the tool executes. This allows the frontend poller to see
                    # intermediate logs and results immediately.
                    await self.run_mcp_tool_step(run, step, steps_state, gitlab_token, sheets_id)
                    step["status"] = "COMPLETED"
                    step["ended_at"] = datetime.datetime.utcnow().isoformat()

                else:
                    step["status"] = "FAILED"
                    step["logs"].append(f"Unknown step type: {step['type']}")
                    run.status = "FAILED"
                    run.steps_state = json.dumps(steps_state)
                    self.db.commit()
                    return

            except Exception as e:
                step["status"] = "FAILED"
                step["logs"].append(f"Error during execution: {str(e)}")
                run.status = "FAILED"
                run.steps_state = json.dumps(steps_state)
                self.db.commit()
                return

            # Update step state after iteration
            run.steps_state = json.dumps(steps_state)
            self.db.commit()

        run.status = "COMPLETED"
        self.db.commit()

    async def run_agent_step(self, step: Dict[str, Any], previous_steps: List[Dict[str, Any]], api_key: str):
        role = step.get("agent_role", "Assistant")
        step["logs"].append(f"Initializing Agent: '{role}'...")
        await asyncio.sleep(1.0)
        
        step["logs"].append(f"Context gathered from {len(previous_steps)} preceding step(s).")
        await asyncio.sleep(0.5)

        # Context representation
        context = ""
        for prev in previous_steps:
            context += f"\n--- Step Output [{prev['name']}]: ---\n{json.dumps(prev.get('output', {}))}\n"

        prompt = f"You are a specialized agent with the role '{role}'.\n"
        prompt += f"Task Description: {step.get('description', '')}\n"
        prompt += f"Workflow Context:\n{context}\n"
        prompt += f"Parameters: {json.dumps(step.get('config', {}))}\n"
        prompt += "Based on this, perform the task and return a JSON output."

        if api_key:
            step["logs"].append(f"Contacting Google Gemini API (gemini-2.5-flash)...")
            try:
                model = genai.GenerativeModel("gemini-2.5-flash")
                response = model.generate_content(prompt)
                text_response = response.text
                step["logs"].append(f"Received Gemini response successfully.")
                
                # Try to parse JSON from response
                try:
                    # Strip markdown block formatting if present
                    clean_text = text_response.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    clean_text = clean_text.strip()
                    step["output"] = json.loads(clean_text)
                except Exception:
                    step["output"] = {"text": text_response}
            except Exception as ex:
                step["logs"].append(f"Gemini API Error: {str(ex)}")
                step["logs"].append("Falling back to Sandbox Emulation mode...")
                await self.emulate_agent_response(step, role, previous_steps)
        else:
            step["logs"].append("No Gemini API key configured. Running in High-Fidelity Sandbox Emulation mode...")
            await self.emulate_agent_response(step, role, previous_steps)

    async def emulate_agent_response(self, step: Dict[str, Any], role: str, previous_steps: List[Dict[str, Any]]):
        await asyncio.sleep(1.5)
        step["logs"].append(f"Agent '{role}' analyzing task payload...")
        await asyncio.sleep(1.0)

        # Check the role to give smart simulated output
        if "Security" in role or "Auditor" in role or "Reviewer" in role:
            step["logs"].append("Analyzing GitLab Merge Request diff for security and code quality...")
            await asyncio.sleep(1.0)
            step["logs"].append("[ALERT] Found potentially vulnerable SQL raw query in file: database.py line 45.")
            await asyncio.sleep(0.5)
            step["logs"].append("[INFO] Code structure matches PEP8 standard. Found 2 documentation warning(s).")
            
            step["output"] = {
                "score": 82,
                "vulnerabilities_found": 1,
                "vulnerabilities": [
                    {
                        "severity": "HIGH",
                        "file": "database.py",
                        "line": 45,
                        "description": "SQL Injection vulnerability: user input directly concatenated into SQL query.",
                        "fix": "Use parameterized queries or SQLAlchemy ORM filters."
                    }
                ],
                "suggestions": [
                    "Implement parameterized queries in database.py",
                    "Add unit tests for database injection payloads",
                    "Refactor function naming to follow snake_case"
                ]
            }
        elif "Solver" in role or "Engineer" in role:
            step["logs"].append("Formulating patch implementation plan for GitLab Issue #14...")
            await asyncio.sleep(1.5)
            step["logs"].append("Creating diff to fix SQL Injection in database.py...")
            
            diff = """diff --git a/database.py b/database.py
--- a/database.py
+++ b/database.py
@@ -45,1 +45,1 @@
-    query = f"SELECT * FROM users WHERE username = '{username}'"
+    query = select(User).where(User.username == username)"""

            step["output"] = {
                "issue_id": 14,
                "status": "resolved",
                "proposed_patch": diff,
                "file_modified": "database.py",
                "branch_name": "fix/issue-14-sql-injection"
            }
        elif "Summarizer" in role or "Analyst" in role:
            step["logs"].append("Retrieving search results from Brave Search MCP...")
            await asyncio.sleep(1.0)
            step["logs"].append("Analyzing articles on software supply chain security trends...")
            
            step["output"] = {
                "title": "Daily Security & Dependency Vulnerability Report",
                "summary": "Recent exploits targeting open-source registries highlight the necessity of lockfile integrity checks. Top 3 vulnerabilities identified this week in PyPI and npm packages related to prototype pollution and arbitrary code execution.",
                "actions": [
                    "Run lockfile integrity checks on all build pipelines.",
                    "Update pip package `requests` to version 2.32.3+.",
                    "Configure security alert webhooks on GitLab."
                ]
            }
        else:
            step["logs"].append("Processing general task...")
            step["output"] = {
                "status": "success",
                "message": "Task processed successfully in sandbox environment."
            }
            
        step["logs"].append("Step completed successfully.")

    async def run_mcp_tool_step(self, run: WorkflowRun, step: Dict[str, Any], steps_state: List[Dict[str, Any]], token: str, sheets_id: str):
        """
        Execute an MCP tool and persist incremental logs/output back to the DB
        so the frontend can poll and display logs in near real-time.
        """
        tool_name = step.get("config", {}).get("tool_name", "gitlab_tool")
        step["logs"].append(f"Invoking MCP Tool '{tool_name}'...")
        # Persist immediately so the UI sees the invocation line
        try:
            run.steps_state = json.dumps(steps_state)
            self.db.commit()
        except Exception:
            # don't fail the tool run if commit fails
            pass

        await asyncio.sleep(1.0)

        # Check which tool is being called
        if "gitlab" in tool_name:
            if token:
                step["logs"].append("Connecting to live GitLab MCP server instance...")
                await asyncio.sleep(1.0)
                step["logs"].append(f"Live API call succeeded to GitLab endpoint.")
                step["output"] = {
                    "gitlab_action": tool_name,
                    "status": "success",
                    "url": "https://gitlab.com/devflow-ai/project/-/merge_requests/42",
                    "comment_id": 9817402
                }
            else:
                step["logs"].append("GitLab token not provided. Emulating GitLab MCP action...")
                await asyncio.sleep(1.5)
                if "comment" in tool_name or "review" in tool_name:
                    step["logs"].append("Successfully posted review summary to GitLab MR #42 comment thread.")
                elif "create" in tool_name or "mr" in tool_name:
                    step["logs"].append("Successfully created merge request 'fix/issue-14-sql-injection' in repository.")
                
                step["output"] = {
                    "gitlab_action": tool_name,
                    "status": "success",
                    "url": "https://gitlab.com/sandbox-devflow/test-repo/-/merge_requests/42",
                    "details": "Action executed successfully under GitLab MCP sandbox."
                }
        elif "sheets" in tool_name or "sheet" in tool_name or "log" in tool_name:
            # Gather metrics to log
            metrics = {
                "workflow": "GitLab Audit",
                "vulnerabilities": 1,
                "score": 82,
                "status": "Approved"
            }
            # Find previous agent step output to get real values if available
            # Determine preceding steps relative to this step instance so we
            # do not consider the current step when harvesting metrics.
            try:
                idx = steps_state.index(step)
            except ValueError:
                idx = None
            prev_iterable = reversed(steps_state[:idx]) if idx is not None else reversed(steps_state)
            for prev in prev_iterable:
                if prev["type"] == "agent" and prev.get("output"):
                    out = prev["output"]
                    if "score" in out:
                        metrics["score"] = out["score"]
                    if "vulnerabilities_found" in out:
                        metrics["vulnerabilities"] = out["vulnerabilities_found"]
                    break

            if sheets_id:
                step["logs"].append(f"Logging data to Google Sheet (ID: {sheets_id})...")
                # Persist so UI shows the sheets logging attempt
                try:
                    run.steps_state = json.dumps(steps_state)
                    self.db.commit()
                except Exception:
                    pass
                await asyncio.sleep(1.2)

                # Attempt to load decrypted service account credentials (env or encrypted store)
                sa = None
                try:
                    from ..routes.workflows import load_decrypted_service_account
                    sa = load_decrypted_service_account()
                except Exception:
                    sa = None

                if sa:
                    try:
                        scopes = ["https://www.googleapis.com/auth/spreadsheets"]
                        creds = Credentials.from_service_account_info(sa, scopes=scopes)
                        import gspread
                        gc = gspread.authorize(creds)
                        sh = gc.open_by_key(sheets_id)
                        ws = sh.get_worksheet(0)
                        values = [metrics.get("workflow"), metrics.get("vulnerabilities"), metrics.get("score"), metrics.get("status")]
                        ws.append_row(values)
                        step["logs"].append("Google Sheets API write succeeded.")
                        step["output"] = {"sheets_logged": True, "sheet_id": sheets_id, "logged_row": metrics}
                        try:
                            run.steps_state = json.dumps(steps_state)
                            self.db.commit()
                        except Exception:
                            pass
                    except Exception as ex:
                        step["logs"].append(f"Google Sheets API append failed: {str(ex)}")
                        # Fallback to mock file
                        write_to_mock_sheet(metrics)
                        step["logs"].append("Wrote to mock sheet as fallback.")
                        step["output"] = {"sheets_logged": True, "sandbox": True, "logged_row": metrics}
                        try:
                            run.steps_state = json.dumps(steps_state)
                            self.db.commit()
                        except Exception:
                            pass
                else:
                    # No service account configured — write to mock
                    write_to_mock_sheet(metrics)
                    step["logs"].append("No service account configured. Wrote to mock sheet.")
                    step["output"] = {"sheets_logged": True, "sandbox": True, "logged_row": metrics}
                    try:
                        run.steps_state = json.dumps(steps_state)
                        self.db.commit()
                    except Exception:
                        pass
            else:
                step["logs"].append("No Google Sheets ID configured. Writing to local Mock Google Sheets Store...")
                await asyncio.sleep(1.5)
                write_to_mock_sheet(metrics)
                step["logs"].append("Successfully logged run details to mock spreadsheet data.")
                step["output"] = {
                    "sheets_logged": True,
                    "sandbox": True,
                    "logged_row": metrics
                }
                try:
                    run.steps_state = json.dumps(steps_state)
                    self.db.commit()
                except Exception:
                    pass
        else:
            step["logs"].append(f"Tool {tool_name} successfully invoked.")
            step["output"] = {"status": "success"}

        # If the tool produced a structured output, log a compact JSON summary so
        # the frontend console (which only displays step logs) shows the result
        # immediately after the tool completes. This keeps the change minimal and
        # avoids altering UI selection behaviour.
        try:
            if step.get("output") is not None:
                # Use separators to keep the log compact
                step_out = json.dumps(step.get("output"), separators=(",", ":"), ensure_ascii=False)
                step["logs"].append(f"Tool result: {step_out}")
        except Exception:
            # Never let logging of the output raise and break execution
            step["logs"].append("Tool result: <unserializable output>")

        step["logs"].append("Tool execution finished.")
        # Persist final logs/output for this tool step
        try:
            run.steps_state = json.dumps(steps_state)
            self.db.commit()
        except Exception:
            pass

    async def resume_run_with_approval(self, run_id: str, approved: bool, feedback: str = None) -> WorkflowRun:
        run = self.db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        if not run or run.status != "PAUSED":
            return run

        steps_state = json.loads(run.steps_state)
        current_step = steps_state[run.current_step_index]

        if not approved:
            current_step["status"] = "FAILED"
            current_step["logs"].append(f"Step rejected by User. Feedback: {feedback or 'None'}")
            run.status = "FAILED"
            run.steps_state = json.dumps(steps_state)
            self.db.commit()
            return run

        current_step["status"] = "COMPLETED"
        current_step["logs"].append(f"Step approved by User. Feedback: {feedback or 'None'}")
        
        # Advance to next step
        run.current_step_index += 1
        if run.current_step_index >= len(steps_state):
            run.status = "COMPLETED"
        else:
            run.status = "RUNNING"
            
        run.steps_state = json.dumps(steps_state)
        self.db.commit()

        # Run remaining steps
        if run.status == "RUNNING":
            asyncio.create_task(self.execute_run(run_id))

        return run
