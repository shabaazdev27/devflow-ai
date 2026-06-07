++DETAILED ARCHITECTURE AND USAGE

Purpose

This document explains how DevFlow AI is organized, how to run and extend it, and why the main components are structured the way they are. It is written for an engineer who will develop or operate the project.

Repository Layout (high level)

- backend/: FastAPI application that runs workflows, exposes REST endpoints, and persists state to SQLite.
  - backend/main.py            - FastAPI app entrypoint
  - backend/routes/            - API route handlers (workflows, mcp helpers)
  - backend/engine.py         - Workflow executor (core orchestration logic)
  - backend/models.py         - SQLAlchemy models (Workflow, WorkflowRun, Setting)
  - backend/schemas.py        - Pydantic request/response schemas
  - backend/database.py       - SQLAlchemy engine, Base, and get_db dependency
  - backend/requirements.txt  - Python package pins for the backend

- workflows/: sample workflow JSON files you can load or import into the system.

- package.json                - frontend (Next.js) deps and scripts
- README.md                   - user-facing quickstart and examples

Why this split-stack design?

The project separates UI and orchestration for clarity, scalability, and tooling reasons:

- Frontend (Next.js) focuses on interactive visualizations, user approval flows, and developer UX. Modern React tooling and Tailwind are a natural fit for a responsive 3D UI.
- Backend (FastAPI) hosts deterministic orchestration, persistence, and external integrations (Google, GitLab). Python has richer AI/LLM libraries and is a common choice for agent orchestration.

This separation keeps concerns isolated and allows running/staging each side independently.

How Workflows Are Modeled

- A workflow is a document (stored in the database) containing a list of steps. Each step has a `type` and a `config`.
- Supported step types (reasoning):
  - `agent`: runs an LLM-driven operation. Use for analysis, summarization, or generation. The backend wraps prompts and context before sending to the model.
  - `mcp_tool`: calls an external tool (GitLab MCP server, diff fetcher, sheet appender). These are deterministic ops that interact with services.
  - `manual_approval`: pauses the run and requires user interaction. This is a safety guardrail for sensitive actions.

Why these types?

- They map to common operator patterns: thinking (agent), acting (tool), and humans-in-the-loop (approval). The clear separation simplifies the engine implementation and auditing.

Backend core pieces and why they exist

- engine.py: Implements the WorkflowEngine that iterates steps, manages run state transitions, logs, and persists results. Running the engine in a background task (FastAPI BackgroundTasks) keeps the API responsive while long-running runs execute.
- routes/workflows.py: HTTP interface used by the frontend and CLI. It converts DB models to Pydantic responses and enqueues engine tasks.
- schemas.py: Pydantic models strictly define request and response shapes to keep contracts explicit and to power automatic OpenAPI docs.
- database.py: A small SQLite session factory and dependency provider. SQLite is used for simple persistence and local development; SQLAlchemy keeps the door open for other DB backends.

Mocking and Sandbox

- The backend supports sandbox mode when external API keys are not present. This simulates responses for faster onboarding and safer experimentation.
- `workflows/sheets/mock` endpoints provide a simple preview mechanism for Google Sheets-like logging without external calls. The mock file path is defined and used by the engine to append rows.

How to run locally (development)

1) Backend

```bash
# create and activate a Python venv (Windows example)
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # PowerShell
# install deps
pip install -r backend/requirements.txt

# run backend (example path used in README)
C:\Users\Engineer\AppData\Local\Programs\Python\Python311\python.exe -m uvicorn backend.main:app --port 8000
```

2) Frontend

```bash
npm install
npm run dev
# open http://localhost:3000
```

API primer (most-used endpoints)

- GET /api/py/workflows
- POST /api/py/workflows           - create a workflow
- POST /api/py/workflows/{id}/run - start execution (background)
- GET /api/py/workflows/runs/{id} - get run status and step states
- POST /api/py/workflows/runs/{id}/approve - approve a paused step

These match the patterns in backend/routes/workflows.py and are the main integration points the frontend uses.

Creating and testing a workflow

1) Create a JSON workflow (see workflows/example.json)
2) Use the POST /workflows API or the frontend to create it
3) Start a run with POST /workflows/{id}/run
4) Monitor run state with GET /workflows/runs/{run_id}

Extending the system (developer notes)

- Adding a new step type: implement parsing and execution in engine.py, update schemas.WorkflowStepBase if new fields are required, and add testing for the new branch.
- Adding a new MCP tool: add a new helper in routes/mcp.py or engine tool resolver. Keep tool functions idempotent and explicit about side effects.
- Tests: backend/test_main.py shows basic endpoints. Use pytest to expand coverage. Keep tests isolated and use temp DB or in-memory SQLite.

Security and safety considerations

- Manual approval steps exist to prevent automatic destructive actions. Use them for PR comments, repo writes, or other write-heavy operations.
- Store real API keys in a secure secret store or environment variables—do not commit them to source control.
- Review logs and append-only audit (Google Sheets) for transparency.

Common troubleshooting

- Backend fails to start: verify Python version (3.11) and that packages from backend/requirements.txt are installed.
- Database locked: SQLite can show locking behavior if multiple processes write concurrently; for heavy parallelism, switch to PostgreSQL.
- Frontend API 404s: ensure Next.js rewrites proxy `/api/py/*` to the backend in development or call the backend directly.

If you want, I can:

1) Add a small management script to import workflows/example.json into the DB.
2) Add a CI workflow that runs backend tests and surfaces real badge URLs.
3) Generate an OpenAPI snippet with example responses embedded into README.

Pick one and I will implement it next.
