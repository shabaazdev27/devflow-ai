import { describe, it, expect } from "vitest";
import { WorkflowResponse, WorkflowRunResponse, StepState } from "../src/agents/types";

// Helper function to validate workflow run structure
function validateWorkflowRun(run: any): run is WorkflowRunResponse {
  return (
    typeof run.id === "string" &&
    typeof run.workflow_id === "string" &&
    ["IDLE", "RUNNING", "PAUSED", "COMPLETED", "FAILED"].includes(run.status) &&
    typeof run.current_step_index === "number" &&
    Array.isArray(run.steps_state)
  );
}

// Helper function to validate workflow structure
function validateWorkflow(wf: any): wf is WorkflowResponse {
  return (
    typeof wf.id === "string" &&
    typeof wf.name === "string" &&
    ["manual", "gitlab_mr", "schedule"].includes(wf.trigger_type) &&
    Array.isArray(wf.steps)
  );
}

describe("Frontend Type and Data Conformance Tests", () => {
  it("should validate a compliant Workflow Run payload", () => {
    const mockRun: WorkflowRunResponse = {
      id: "run-uuid-1234",
      workflow_id: "gitlab-mr-reviewer",
      status: "PAUSED",
      current_step_index: 3,
      steps_state: [
        {
          name: "Analyze MR Diff",
          type: "agent",
          status: "COMPLETED",
          agent_role: "Senior Code Reviewer",
          logs: ["Initializing Agent...", "Done"],
          output: { score: 90 },
          started_at: "2026-06-07T12:00:00Z",
          ended_at: "2026-06-07T12:01:00Z"
        },
        {
          name: "Approve MR Comments",
          type: "manual_approval",
          status: "PAUSED",
          logs: ["Awaiting user decision..."],
          approval_prompt: "Please approve code changes."
        }
      ],
      created_at: "2026-06-07T12:00:00Z",
      updated_at: "2026-06-07T12:01:00Z"
    };

    expect(validateWorkflowRun(mockRun)).toBe(true);
    expect(mockRun.steps_state[0].status).toBe("COMPLETED");
    expect(mockRun.steps_state[1].status).toBe("PAUSED");
  });

  it("should validate a compliant Workflow Template payload", () => {
    const mockWorkflow: WorkflowResponse = {
      id: "gitlab-mr-reviewer",
      name: "GitLab MR Code Auditor",
      description: "Reviews a GitLab MR",
      trigger_type: "manual",
      trigger_config: {},
      steps: [
        {
          name: "Analyze MR Diff",
          type: "agent",
          agent_role: "Senior Code Reviewer",
          description: "Inspect code",
          config: {}
        }
      ],
      created_at: "2026-06-07T12:00:00Z",
      updated_at: "2026-06-07T12:01:00Z"
    };

    expect(validateWorkflow(mockWorkflow)).toBe(true);
    expect(mockWorkflow.steps[0].type).toBe("agent");
  });

  it("should reject an invalid Workflow Run payload", () => {
    const invalidRun = {
      id: 1234, // Should be string
      workflow_id: "gitlab-mr-reviewer",
      status: "INVALID_STATUS", // Invalid enum
      current_step_index: "three", // Should be number
      steps_state: "not-an-array" // Should be array
    };

    expect(validateWorkflowRun(invalidRun)).toBe(false);
  });
});
