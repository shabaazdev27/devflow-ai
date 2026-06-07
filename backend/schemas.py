from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class WorkflowStepBase(BaseModel):
    name: str
    type: str # 'agent' | 'manual_approval' | 'mcp_tool'
    agent_role: Optional[str] = None # e.g. 'Reviewer', 'Vulnerability Scanner', 'Summarizer'
    description: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)

class WorkflowStep(WorkflowStepBase):
    pass

class WorkflowBase(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_type: str # 'manual' | 'gitlab_mr' | 'schedule'
    trigger_config: Dict[str, Any] = Field(default_factory=dict)
    steps: List[WorkflowStep]

class WorkflowCreate(WorkflowBase):
    pass

class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    trigger_type: str
    trigger_config: Dict[str, Any]
    steps: List[WorkflowStep]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class StepState(BaseModel):
    name: str
    type: str
    status: str # 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
    agent_role: Optional[str] = None
    description: Optional[str] = None
    logs: List[str] = Field(default_factory=list)
    output: Optional[Dict[str, Any]] = None
    approval_prompt: Optional[str] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None

class WorkflowRunResponse(BaseModel):
    id: str
    workflow_id: str
    status: str
    current_step_index: int
    steps_state: List[StepState]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class SettingCreate(BaseModel):
    key: str
    value: str

class SettingResponse(BaseModel):
    key: str
    value: Optional[str]

    class Config:
        from_attributes = True

class ApprovalRequest(BaseModel):
    approve: bool
    feedback: Optional[str] = None
