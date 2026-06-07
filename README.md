# DevFlow AI

Summary

DevFlow AI is a developer workspace for designing, running, and visualizing multi-agent workflows. It pairs a Next.js frontend (interactive 3D glassmorphism UI) with a FastAPI backend that orchestrates agent loops, integrates with a GitLab MCP server, and optionally calls Google services (Gemini LLM, Google Sheets).

Requirements

- Windows OS (development-tested)
- Node.js v18+ (frontend)
- Python 3.11 (backend)

Quick Start

1) Start the backend (FastAPI / Uvicorn)

```bash
# From the project root (example Windows python path shown in project README)
C:\Users\Engineer\AppData\Local\Programs\Python\Python311\python.exe -m uvicorn backend.main:app --port 8000
```

The backend API will run at http://127.0.0.1:8000

2) Start the frontend (Next.js)

```bash
# From the project root in a new terminal
npm run dev
```

Open http://localhost:3000 in your browser.

Sandbox vs Live Modes

- Sandbox mode (default when API keys are not provided): the backend simulates Google/GitLab responses so you can explore the product without external credentials.
- Live mode: provide Google and GitLab credentials in Settings to enable real API calls.

Basic Usage

- Trigger a workflow run from the frontend or POST to `/api/py/workflows/{id}/run`.
- Approve a paused step by POSTing to `/api/py/workflows/runs/{run_id}/approve`.
- The backend persists run state and logs to SQLite and streams line-by-line execution logs.

Architecture (high level)

```
                     ┌─────────────────────────────────────────┐
                     │           Next.js Frontend              │
                     │  - 3D Glassmorphism UI (Tailwind v4)    │
                     │  - Interactive 3D Pipeline Canvas       │
                     │  - Live-updating Mock Sheets            │
                     │  - Interactive MCP Tool Tester          │
                     └────────────────────┬────────────────────┘
                                          │ Proxy Rewrites (/api/py/*)
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │            FastAPI Backend              │
                     │  - REST API Controllers (Uvicorn)       │
                     │  - SQLite DB via SQLAlchemy ORM         │
                     │  - Async Background Task Orchestration  │
                     └──────┬─────────────┬─────────────┬──────┘
                            │             │             │
        ┌───────────────────┴─┐    ┌──────┴──────────┐  └───────────────────┐
        │  google-generativeai│    │   GitLab MCP    │                      │  gspread / mock
        │  - Gemini 1.5 Flash │    │  - Repos, Diff  │                      │  - Metrics Log
        │  - Planning & Review│    │  - Issues & MRs │                      │  - Row Appending
        └─────────────────────┘    └─────────────────┘                      ▼
                                                             ┌──────────────────────────────┐
                                                             │     Google Sheets API        │
                                                             └──────────────────────────────┘
```

Key Concepts

- Workflow Steps: types include `agent`, `mcp_tool`, and `manual_approval`.
- State machine: run states like `IDLE`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED` are persisted to SQLite.
- Human-in-the-loop: `manual_approval` steps pause execution waiting for explicit user approval.

Running Tests

- Backend (pytest):

```bash
# Example Windows python path used in CI docs
C:\Users\Engineer\AppData\Local\Programs\Python\Python311\python.exe -m pytest backend/test_main.py
```

- Frontend (vitest):

```bash
npm run test
```

Development Notes

- The repository uses a split-stack approach: React/Next.js for the UI and Python/FastAPI for orchestration.
- The Next.js app proxies API calls to the backend under `/api/py/*` in development.
- The backend uses SQLAlchemy + SQLite to persist workflow templates, run history, and logs.

Contributing

- Read the code, run the app locally, and open small, focused pull requests.
- Keep changes minimal and well-tested. Add unit tests for backend features and component tests for frontend changes.

License

See the LICENSE file in this repository for license details.

If you'd like, I can also add a short Development Quickstart that installs dependencies and creates a virtual environment—tell me if you want that added.

Table of Contents

- Quick Start
- Development Quickstart (setup)
- Example Workflow JSON
- API Examples
- Sandbox vs Live Modes
- Architecture
- Key Concepts
- Running Tests
- Development Notes
- Contributing
- License

Development Quickstart

1) Create a Python virtual environment and install backend dependencies

```bash
# create venv (Windows)
python -m venv .venv
# activate venv (PowerShell)
.\.venv\Scripts\Activate.ps1
# or Command Prompt
.\.venv\Scripts\activate.bat

# install backend deps
pip install -r backend/requirements.txt
```

2) Install frontend dependencies

```bash
npm install
```

Example Workflow JSON

See a ready-made example at `workflows/example.json`. It demonstrates the supported step types and configuration fields. Minimal example (excerpt):

```json
{
  "id": "example-audit",
  "name": "MR Code Audit",
  "steps": [
    { "type": "agent", "name": "analyze_diff", "prompt": "Detect security issues in the diff." },
    { "type": "mcp_tool", "name": "get_diff", "params": { "project": "my/repo", "mr": 42 } },
    { "type": "manual_approval", "name": "confirm_and_post" }
  ]
}
```

API Examples

The backend exposes the following workflow-related endpoints (paths are mounted under `/api/py` by the Next.js proxy in development):

- List workflows

  GET /api/py/workflows

- Create a workflow

  POST /api/py/workflows
  Body: WorkflowCreate (see backend/schemas.py)

- Start a workflow run (create a new run and execute)

  POST /api/py/workflows/{workflow_id}/run
  Response: WorkflowRunResponse

  Example request body (optional):

  ```json
  { "triggered_by": "engineer@example.com" }
  ```

- Get all runs

  GET /api/py/workflows/runs

- Get run details

  GET /api/py/workflows/runs/{run_id}

- Approve a paused run (resume)

  POST /api/py/workflows/runs/{run_id}/approve
  Body: ApprovalRequest

  Example ApprovalRequest body:

  ```json
  { "approve": true, "feedback": "Looks good to me." }
  ```

- Delete a workflow

  DELETE /api/py/workflows/{workflow_id}

- Mock sheets preview (sandbox helper)

  GET /api/py/workflows/sheets/mock

- Clear mock sheets

  DELETE /api/py/workflows/sheets/mock

- Settings

  GET /api/py/workflows/settings/get
  POST /api/py/workflows/settings/set

  Example Setting body (POST):

  ```json
  { "key": "GOOGLE_API_KEY", "value": "..." }
  ```

Badges

Add these badges to the top of the README when you have CI and coverage configured. Example placeholders:

- build: [![build status](https://img.shields.io/badge/build-passing-brightgreen)]
- tests: [![tests](https://img.shields.io/badge/tests-OK-blue)]
- coverage: [![coverage](https://img.shields.io/badge/coverage-90%25-yellowgreen)]
