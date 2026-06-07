#!/usr/bin/env python3
"""
Create and execute a test run of the vulnerability-news-synthesizer workflow.
Writes to the mock sheets file and prints the run logs.

Run from repo root: python scripts/run_vuln_workflow.py
"""
import os
import sys
import json
import uuid
import datetime
import asyncio

# Ensure repo root is on path
sys.path.insert(0, os.getcwd())

from backend.database import SessionLocal
from backend.models import Workflow, WorkflowRun
from backend.engine import WorkflowEngine, MOCK_SHEETS_FILE


def create_and_run():
    db = SessionLocal()
    try:
        # Find the vulnerability workflow by known names/ids
        wf = db.query(Workflow).filter(Workflow.id == 'vulnerability-news-synthesizer').first()
        if not wf:
            # fallback: look for workflows with 'vulnerability' or 'Vulnerability' in the name
            wf = db.query(Workflow).filter(Workflow.name.ilike('%vulnerab%')).first()
        if not wf:
            print('Vulnerability workflow not found. Available workflows:')
            for w in db.query(Workflow).all():
                print(' -', w.id, w.name)
            return 1

        steps = json.loads(wf.steps)
        steps_state = []
        for step in steps:
            steps_state.append({
                'name': step['name'],
                'type': step['type'],
                'status': 'IDLE',
                'agent_role': step.get('agent_role'),
                'description': step.get('description'),
                'logs': [],
                'output': None,
                'approval_prompt': None,
                'started_at': None,
                'ended_at': None,
                'config': step.get('config', {})
            })

        run_id = str(uuid.uuid4())
        db_run = WorkflowRun(
            id=run_id,
            workflow_id=wf.id,
            status='RUNNING',
            current_step_index=0,
            steps_state=json.dumps(steps_state),
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow()
        )
        db.add(db_run)
        db.commit()
        db.refresh(db_run)

        print(f'Created run {run_id} — executing...')

        engine = WorkflowEngine(db)
        asyncio.run(engine.execute_run(run_id))

        # Reload run and print summary
        run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        ss = json.loads(run.steps_state)
        print('\nRun status:', run.status)
        for i, s in enumerate(ss, start=1):
            print(f'\nStep {i}: {s["name"]} — {s["status"]}')
            print('Logs:')
            for ln in s.get('logs', []):
                print('  ', ln)
            if s.get('output'):
                print('Output:', json.dumps(s['output'], indent=2))

        # Print mock sheet contents if present
        if os.path.exists(MOCK_SHEETS_FILE):
            try:
                with open(MOCK_SHEETS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                print('\nMock sheets entries (last 5):')
                for r in data[-5:]:
                    print(json.dumps(r, indent=2))
            except Exception as e:
                print('Failed reading mock sheets file:', e)
        else:
            print('\nNo mock sheets file found at', MOCK_SHEETS_FILE)

        return 0
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(create_and_run())
