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

@router.post("/settings/set", response_model=SettingResponse)
def set_setting(setting: SettingCreate, db: Session = Depends(get_db)):
    db_setting = db.query(Setting).filter(Setting.key == setting.key).first()
    if db_setting:
        db_setting.value = setting.value
    else:
        db_setting = Setting(key=setting.key, value=setting.value)
        db.add(db_setting)
    db.commit()
    db.refresh(db_setting)
    return db_setting
