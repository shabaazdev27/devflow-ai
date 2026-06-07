import uuid
import json
import os
import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from ..database import get_db
from ..models import Workflow, WorkflowRun, Setting
from ..schemas import (
    WorkflowCreate, WorkflowResponse, WorkflowRunResponse, 
    ApprovalRequest, SettingCreate, SettingResponse
)
from ..engine import WorkflowEngine, MOCK_SHEETS_FILE
from ..utils.crypto import save_encrypted_service_account, load_decrypted_service_account, remove_encrypted_service_account
import tempfile
import shutil
import subprocess
import os
import re
from datetime import datetime
import json
from fastapi.responses import StreamingResponse
import io
import zipfile

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Helper to parse steps from model
def to_workflow_response(w: Workflow) -> WorkflowResponse:
    return WorkflowResponse(
        id=w.id,
        name=w.name,
        description=w.description,
        trigger_type=w.trigger_type,
        trigger_config=json.loads(w.trigger_config or "{}"),
        steps=json.loads(w.steps),
        created_at=w.created_at,
        updated_at=w.updated_at
    )

def to_run_response(r: WorkflowRun) -> WorkflowRunResponse:
    return WorkflowRunResponse(
        id=r.id,
        workflow_id=r.workflow_id,
        status=r.status,
        current_step_index=r.current_step_index,
        steps_state=json.loads(r.steps_state),
        created_at=r.created_at,
        updated_at=r.updated_at
    )

@router.get("", response_model=List[WorkflowResponse])
def get_workflows(db: Session = Depends(get_db)):
    workflows = db.query(Workflow).all()
    return [to_workflow_response(w) for w in workflows]

@router.post("", response_model=WorkflowResponse)
def create_workflow(workflow: WorkflowCreate, db: Session = Depends(get_db)):
    db_workflow = Workflow(
        id=str(uuid.uuid4()),
        name=workflow.name,
        description=workflow.description,
        trigger_type=workflow.trigger_type,
        trigger_config=json.dumps(workflow.trigger_config),
        steps=json.dumps([step.dict() for step in workflow.steps])
    )
    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)
    return to_workflow_response(db_workflow)

@router.get("/runs", response_model=List[WorkflowRunResponse])
def get_all_runs(db: Session = Depends(get_db)):
    runs = db.query(WorkflowRun).order_by(WorkflowRun.created_at.desc()).all()
    return [to_run_response(r) for r in runs]

@router.get("/runs/{run_id}", response_model=WorkflowRunResponse)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return to_run_response(run)

@router.post("/{workflow_id}/run", response_model=WorkflowRunResponse)
def run_workflow(workflow_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Parse steps and build initial state
    steps = json.loads(workflow.steps)
    steps_state = []
    for step in steps:
        steps_state.append({
            "name": step["name"],
            "type": step["type"],
            "status": "IDLE",
            "agent_role": step.get("agent_role"),
            "description": step.get("description"),
            "logs": [],
            "output": None,
            "approval_prompt": None,
            "started_at": None,
            "ended_at": None
        })

    run_id = str(uuid.uuid4())
    db_run = WorkflowRun(
        id=run_id,
        workflow_id=workflow_id,
        status="RUNNING",
        current_step_index=0,
        steps_state=json.dumps(steps_state)
    )
    db.add(db_run)
    db.commit()
    db.refresh(db_run)

    # Start the async execution task
    engine = WorkflowEngine(db)
    background_tasks.add_task(engine.execute_run, run_id)

    return to_run_response(db_run)

@router.post("/runs/{run_id}/approve", response_model=WorkflowRunResponse)
async def approve_run(run_id: str, req: ApprovalRequest, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    if run.status != "PAUSED":
        raise HTTPException(status_code=400, detail="Workflow run is not in PAUSED state")

    engine = WorkflowEngine(db)
    updated_run = await engine.resume_run_with_approval(run_id, req.approve, req.feedback)
    return to_run_response(updated_run)

@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Clean up associated runs
    db.query(WorkflowRun).filter(WorkflowRun.workflow_id == workflow_id).delete()
    db.delete(workflow)
    db.commit()
    return {"status": "success", "message": "Workflow deleted"}

@router.get("/sheets/mock")
def get_mock_sheets():
    if os.path.exists(MOCK_SHEETS_FILE):
        try:
            with open(MOCK_SHEETS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@router.delete("/sheets/mock")
def clear_mock_sheets():
    if os.path.exists(MOCK_SHEETS_FILE):
        try:
            os.remove(MOCK_SHEETS_FILE)
        except Exception:
            pass
    return {"status": "success"}

@router.get("/settings/get", response_model=List[SettingResponse])
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Setting).all()
    return settings


@router.post("/scan")
def scan_repository(payload: Dict[str, Any]):
    """Lightweight on-demand repository scanner.

    Accepts JSON body: { "repo": "<local-path|git-url>" }
    Returns a JSON report and writes a file to src/data/scan_reports/
    """
    repo = payload.get("repo")
    if not repo:
        raise HTTPException(status_code=400, detail="Missing 'repo' in request body")

    # Quick patterns (kept simple and readable)
    PATTERNS = {
        'raw_sql_fstring': re.compile(r"f[\"'].*SELECT.*\{[^}]+\}.*[\"']", re.IGNORECASE),
        'cursor_execute': re.compile(r"cursor\.execute\(|\.execute\(", re.IGNORECASE),
        'os_system_subprocess': re.compile(r"\bos\.system\(|subprocess\.|Popen\(|call\(|check_output\(", re.IGNORECASE),
        'eval_exec_pickle': re.compile(r"\beval\(|\bexec\(|pickle\.load\(|yaml\.load\(|marshal\.loads\(|compile\(", re.IGNORECASE),
        'secrets_tokens': re.compile(r"\b(token|secret|password|private_key|ACCESS_TOKEN|SECRET_KEY|gitlab_access_token|gemini_api_key)\b", re.IGNORECASE),
        'cve_mentions': re.compile(r"CVE-\d{4}-\d{4,}", re.IGNORECASE),
        'smb_unc': re.compile(r"\\\\[A-Za-z0-9_.-]+\\\\[A-Za-z0-9_.-]+"),
    }

    SKIP_DIRS = {'.git', 'node_modules', '.next', '__pycache__', 'dist', 'build', 'venv', '.venv', 'backend/.secrets'}
    TEXT_EXTS = {'.py', '.js', '.ts', '.tsx', '.jsx', '.md', '.txt', '.json', '.yml', '.yaml', '.Dockerfile'}

    def is_text_file(path: str) -> bool:
        _, ext = os.path.splitext(path)
        if ext in TEXT_EXTS:
            return True
        name = os.path.basename(path)
        if name.lower().startswith('dockerfile'):
            return True
        return False

    temp_dir = None
    target = repo
    # If repo looks like a git URL, clone it temporarily
    if isinstance(repo, str) and (repo.startswith('http://') or repo.startswith('https://') or repo.endswith('.git')):
        temp_dir = tempfile.mkdtemp(prefix='repo-scan-')
        try:
            subprocess.check_call(['git', 'clone', '--depth', '1', repo, temp_dir])
            target = temp_dir
        except Exception as e:
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"Failed to clone repo: {e}")

    findings = []
    total_files = 0
    try:
        for dirpath, dirnames, filenames in os.walk(target):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                path = os.path.join(dirpath, fn)
                if not is_text_file(path):
                    continue
                total_files += 1
                try:
                    with open(path, 'r', encoding='utf-8', errors='replace') as f:
                        for i, line in enumerate(f, start=1):
                            for key, regex in PATTERNS.items():
                                if regex.search(line):
                                    findings.append({
                                        'file': os.path.relpath(path, target),
                                        'line': i,
                                        'match_type': key,
                                        'snippet': line.strip()[:400]
                                    })
                                    break
                except Exception:
                    continue
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

    report = {'root': repo, 'total_files_scanned': total_files, 'findings': findings, 'scanned_at': datetime.utcnow().isoformat() + 'Z'}

    out_dir = os.path.join('src', 'data', 'scan_reports')
    os.makedirs(out_dir, exist_ok=True)
    fname = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ') + '_report.json'
    out_path = os.path.join(out_dir, fname)
    try:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2)
    except Exception:
        # ignore write failure but still return report
        out_path = None

    return {'report': report, 'report_file': out_path}


@router.get('/scan/reports/download')
def download_scan_reports():
    """Return a zip archive of all scan reports under src/data/scan_reports."""
    reports_dir = os.path.join('src', 'data', 'scan_reports')
    if not os.path.exists(reports_dir):
        raise HTTPException(status_code=404, detail='No scan reports found')

    # Create zip in-memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(reports_dir):
            for fname in files:
                path = os.path.join(root, fname)
                arcname = os.path.relpath(path, reports_dir)
                z.write(path, arcname)
    buf.seek(0)
    now = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    return StreamingResponse(buf, media_type='application/zip', headers={
        'Content-Disposition': f'attachment; filename="scan_reports_{now}.zip"'
    })


@router.post('/settings/upload_service_account')
def upload_service_account(payload: Dict[str, Any]):
    """Upload service account JSON (as raw JSON body) and store it encrypted on disk.
    This endpoint requires the env var SERVICE_ACCOUNT_ENC_KEY to be set.
    Returns success: true if stored.
    """
    try:
        data = json.dumps(payload).encode()
        ok = save_encrypted_service_account(data)
        if not ok:
            raise HTTPException(status_code=500, detail="Encryption key not configured on server")
        return {"success": True}
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@router.delete('/settings/service_account')
def delete_service_account():
    ok = remove_encrypted_service_account()
    return {"success": ok}

@router.post("/settings/set", response_model=SettingResponse)
def set_setting(setting: SettingCreate, db: Session = Depends(get_db)):
    # Normalize certain settings before saving
    value_to_save = setting.value
    # Normalize Google Sheets ID: allow pasting full URL and extract the spreadsheet ID
    if setting.key == "google_sheets_id" and setting.value:
        import re
        m = re.search(r"/d/([a-zA-Z0-9-_]+)", setting.value)
        if m:
            value_to_save = m.group(1)
        else:
            # also accept raw ID (no change) or whitespace-trimmed
            value_to_save = setting.value.strip()

    # Trim whitespace for token-like values
    if setting.key in ("gitlab_access_token", "gemini_api_key") and setting.value:
        value_to_save = setting.value.strip()

    db_setting = db.query(Setting).filter(Setting.key == setting.key).first()
    if db_setting:
        db_setting.value = value_to_save
    else:
        db_setting = Setting(key=setting.key, value=value_to_save)
        db.add(db_setting)
    db.commit()
    db.refresh(db_setting)
    return db_setting


@router.get("/settings/test_gemini")
def test_gemini(db: Session = Depends(get_db)):
    """
    Lightweight Gemini connectivity test. Currently verifies that a Gemini API key
    is present in the settings. Extend this to make a real API call to Google
    Gemini endpoint when you have API details and want live verification.
    """
    gemini = db.query(Setting).filter(Setting.key == "gemini_api_key").first()
    if gemini and gemini.value:
        return {"success": True, "message": "Gemini key present", "live": True}
    return {"success": False, "message": "Gemini key not set", "live": False}
