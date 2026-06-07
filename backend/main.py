import json
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base, SessionLocal
from .models import Workflow
from .routes import workflows, mcp

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="DevFlow AI Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this. For local dev, allow all.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(workflows.router, prefix="/api")
app.include_router(mcp.router, prefix="/api")

# Seed default workflows on startup
def seed_default_workflows(db=None):
    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True
    try:
        count = db.query(Workflow).count()
        if count > 0:
            logger.info("Database already seeded.")
            return

        logger.info("Seeding default workflows...")
        
        # 1. GitLab MR Code Reviewer
        mr_reviewer = Workflow(
            id="gitlab-mr-reviewer",
            name="GitLab MR Code Auditor",
            description="Reviews a GitLab Merge Request for performance, style, and security. Logs results to Google Sheets, then posts comments upon manual developer approval.",
            trigger_type="manual",
            trigger_config=json.dumps({}),
            steps=json.dumps([
                {
                    "name": "Analyze MR Diff",
                    "type": "agent",
                    "agent_role": "Senior Code Reviewer",
                    "description": "Inspect the merge request code changes for performance bottlenecks, style consistency, and architectural design.",
                    "config": {}
                },
                {
                    "name": "Security Audit",
                    "type": "agent",
                    "agent_role": "Senior Security Auditor",
                    "description": "Audit the changes for OWASP Top 10 vulnerabilities, specifically looking for injection attacks and memory leaks.",
                    "config": {}
                },
                {
                    "name": "Log Review to Google Sheets",
                    "type": "mcp_tool",
                    "description": "Log the review score and count of vulnerabilities to our project metrics sheet.",
                    "config": {"tool_name": "append_row_to_sheet"}
                },
                {
                    "name": "Approve MR Comments",
                    "type": "manual_approval",
                    "description": "Review and approve the comments compiled by the AI agent before publishing to GitLab.",
                    "config": {}
                },
                {
                    "name": "Submit Comments to GitLab",
                    "type": "mcp_tool",
                    "description": "Post the approved review feedback directly as a comment on GitLab MR #42.",
                    "config": {"tool_name": "gitlab_create_mr_comment"}
                }
            ])
        )

        # 2. Automated Issue Solver
        issue_solver = Workflow(
            id="automated-issue-solver",
            name="GitLab Issue Auto-Solver",
            description="Scans open issues, designs a bug fix, and submits a GitLab Merge Request with the solution.",
            trigger_type="manual",
            trigger_config=json.dumps({}),
            steps=json.dumps([
                {
                    "name": "Triage Issue and Plan Fix",
                    "type": "agent",
                    "agent_role": "Systems Architect",
                    "description": "Read the issue description, identify the root cause, and draft a software design to fix the bug.",
                    "config": {}
                },
                {
                    "name": "Approve Patch Implementation",
                    "type": "manual_approval",
                    "description": "Approve the generated patch before creating a new GitLab branch.",
                    "config": {}
                },
                {
                    "name": "Create Branch & MR",
                    "type": "mcp_tool",
                    "description": "Create a new branch and open a Merge Request on GitLab with the implemented patch.",
                    "config": {"tool_name": "gitlab_create_merge_request"}
                }
            ])
        )

        # 3. Vulnerability News Synthesizer
        threat_intel = Workflow(
            id="vulnerability-news-synthesizer",
            name="Vulnerability Digest & Logger",
            description="Runs a daily security scan of external vulnerabilities, compiles a report, and logs the results to Google Sheets.",
            trigger_type="schedule",
            trigger_config=json.dumps({"interval_hours": 24}),
            steps=json.dumps([
                {
                    "name": "Retrieve Security Advisories",
                    "type": "agent",
                    "agent_role": "Threat Intelligence Agent",
                    "description": "Gather the latest software vulnerability alerts and details from CVE databases and security feeds.",
                    "config": {}
                },
                {
                    "name": "Summarize Vulnerability Report",
                    "type": "agent",
                    "agent_role": "Security Summarizer",
                    "description": "Summarize findings and write a detailed markdown report outlining action items.",
                    "config": {}
                },
                {
                    "name": "Log Results to Google Sheets",
                    "type": "mcp_tool",
                    "description": "Append threat assessment score and log details to the team Google Sheet.",
                    "config": {"tool_name": "append_row_to_sheet"}
                }
            ])
        )

        db.add(mr_reviewer)
        db.add(issue_solver)
        db.add(threat_intel)
        db.commit()
        logger.info("Successfully seeded database.")
    except Exception as e:
        logger.error(f"Error seeding database: {e}")
    finally:
        if own_session:
            db.close()

seed_default_workflows()
