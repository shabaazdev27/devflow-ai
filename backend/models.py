import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text
from .database import Base

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    trigger_type = Column(String, nullable=False) # manual, gitlab_mr, schedule
    trigger_config = Column(Text, nullable=True) # JSON string
    steps = Column(Text, nullable=False) # JSON string listing the steps
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, index=True, nullable=False)
    status = Column(String, default="IDLE") # IDLE, RUNNING, PAUSED, COMPLETED, FAILED
    current_step_index = Column(Integer, default=0)
    steps_state = Column(Text, nullable=False) # JSON string containing states, logs, and outputs per step
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)
