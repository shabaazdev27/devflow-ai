export interface WorkflowStep {
  name: string;
  type: 'agent' | 'manual_approval' | 'mcp_tool';
  agent_role?: string;
  description?: string;
  config: Record<string, any>;
}

export interface WorkflowResponse {
  id: string;
  name: string;
  description?: string;
  trigger_type: 'manual' | 'gitlab_mr' | 'schedule';
  trigger_config: Record<string, any>;
  steps: WorkflowStep[];
  created_at: string;
  updated_at: string;
}

export interface StepState {
  name: string;
  type: 'agent' | 'manual_approval' | 'mcp_tool';
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  agent_role?: string;
  description?: string;
  logs: string[];
  output?: Record<string, any> | null;
  approval_prompt?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface WorkflowRunResponse {
  id: string;
  workflow_id: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  current_step_index: number;
  steps_state: StepState[];
  created_at: string;
  updated_at: string;
}

export interface SettingResponse {
  key: string;
  value?: string | null;
}

export interface MockSheetRow {
  timestamp: string;
  workflow: string;
  vulnerabilities: number;
  score: number;
  status: string;
  [key: string]: any;
}
