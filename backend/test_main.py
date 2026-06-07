import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
import json

from backend.database import Base, get_db
from backend.main import app

# Setup test SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_devflow.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def run_around_tests():
    # Setup: Clear tables before each test
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    # Re-seed for tests
    from backend.main import seed_default_workflows
    db = TestingSessionLocal()
    seed_default_workflows(db=db)
    
    yield
    # Teardown
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_devflow.db"):
        try:
            os.remove("./test_devflow.db")
        except Exception:
            pass

def test_get_workflows():
    response = client.get("/api/workflows")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3
    names = [w["name"] for w in data]
    assert "GitLab MR Code Auditor" in names
    assert "GitLab Issue Auto-Solver" in names

def test_settings():
    # Set key
    response = client.post("/api/workflows/settings/set", json={"key": "gemini_api_key", "value": "test-key"})
    assert response.status_code == 200
    assert response.json()["value"] == "test-key"

    # Get keys
    response = client.get("/api/workflows/settings/get")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["key"] == "gemini_api_key"
    assert data[0]["value"] == "test-key"

def test_run_workflow_and_approval():
    # Trigger run
    response = client.post("/api/workflows/gitlab-mr-reviewer/run")
    assert response.status_code == 200
    data = response.json()
    run_id = data["id"]
    assert data["workflow_id"] == "gitlab-mr-reviewer"
    
    # Wait for async background task execution (which simulates step-by-step)
    # For testing, we can directly invoke the run_run engine synchronously
    from backend.database import SessionLocal
    from backend.engine import WorkflowEngine
    
    db = TestingSessionLocal()
    engine_runner = WorkflowEngine(db)
    
    # Run the engine
    import asyncio
    asyncio.run(engine_runner.execute_run(run_id))
    
    # Re-fetch from client
    response = client.get(f"/api/workflows/runs/{run_id}")
    assert response.status_code == 200
    run_data = response.json()
    
    # It should pause at the fourth step: "Approve MR Comments"
    assert run_data["status"] == "PAUSED"
    assert run_data["current_step_index"] == 3
    assert run_data["steps_state"][3]["status"] == "PAUSED"
    
    # Submit Approval
    response = client.post(
        f"/api/workflows/runs/{run_id}/approve",
        json={"approve": True, "feedback": "Looks great!"}
    )
    assert response.status_code == 200
    run_data = response.json()
    # It should immediately resume and mark step as COMPLETED or run
    assert run_data["status"] == "COMPLETED" or run_data["status"] == "RUNNING"
