"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, Cpu, UserCheck, HelpCircle } from "lucide-react";
import { WorkflowStep } from "@/src/agents/types";

interface WorkflowBuilderProps {
  onSave: (workflow: {
    name: string;
    description: string;
    trigger_type: 'manual' | 'gitlab_mr' | 'schedule';
    trigger_config: Record<string, any>;
    steps: WorkflowStep[];
  }) => void;
  onCancel: () => void;
}

export default function WorkflowBuilder({ onSave, onCancel }: WorkflowBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<'manual' | 'gitlab_mr' | 'schedule'>("manual");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      name: "Analyze Code Changes",
      type: "agent",
      agent_role: "Senior Code Reviewer",
      description: "Inspect GitLab Merge Request code diff for errors, style issues, and performance optimizations.",
      config: {}
    }
  ]);

  const addStep = () => {
    setSteps([
      ...steps,
      {
        name: `New Step ${steps.length + 1}`,
        type: "agent",
        agent_role: "Assistant",
        description: "Task description for this agent...",
        config: {}
      }
    ]);
  };

  const removeStep = (index: number) => {
    if (steps.length === 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, updatedFields: Partial<WorkflowStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updatedFields };
    setSteps(newSteps);
  };

  const handleLoadTemplate = (templateName: string) => {
    if (templateName === "review") {
      setName("GitLab MR Code Auditor");
      setDescription("Automated review of GitLab Merge Request diff for security and code quality. Syncs metrics to Google Sheets, requesting human approval before posting comments.");
      setTriggerType("manual");
      setSteps([
        {
          name: "Analyze MR Diff",
          type: "agent",
          agent_role: "Senior Code Reviewer",
          description: "Inspect the merge request code changes for performance bottlenecks, style consistency, and architectural design.",
          config: {}
        },
        {
          name: "Security Audit",
          type: "agent",
          agent_role: "Senior Security Auditor",
          description: "Audit the changes for OWASP Top 10 vulnerabilities, specifically looking for injection attacks and memory leaks.",
          config: {}
        },
        {
          name: "Log Review to Google Sheets",
          type: "mcp_tool",
          description: "Log the review score and count of vulnerabilities to our project metrics sheet.",
          config: {"tool_name": "append_row_to_sheet"}
        },
        {
          name: "Approve MR Comments",
          type: "manual_approval",
          description: "Review and approve the comments compiled by the AI agent before publishing to GitLab.",
          config: {}
        },
        {
          name: "Submit Comments to GitLab",
          type: "mcp_tool",
          description: "Post the approved review feedback directly as a comment on GitLab MR #42.",
          config: {"tool_name": "gitlab_create_mr_comment"}
        }
      ]);
    } else if (templateName === "solve") {
      setName("GitLab Issue Auto-Solver");
      setDescription("Scans open issues, designs a bug fix, and submits a GitLab Merge Request with the solution.");
      setTriggerType("manual");
      setSteps([
        {
          name: "Triage Issue and Plan Fix",
          type: "agent",
          agent_role: "Systems Architect",
          description: "Read the issue description, identify the root cause, and draft a software design to fix the bug.",
          config: {}
        },
        {
          name: "Approve Patch Implementation",
          type: "manual_approval",
          description: "Approve the generated patch before creating a new GitLab branch.",
          config: {}
        },
        {
          name: "Create Branch & MR",
          type: "mcp_tool",
          description: "Create a new branch and open a Merge Request on GitLab with the implemented patch.",
          config: {"tool_name": "gitlab_create_merge_request"}
        }
      ]);
    } else if (templateName === "threat") {
      setName("Vulnerability Digest & Logger");
      setDescription("Runs a daily security scan of external vulnerabilities, compiles a report, and logs the results to Google Sheets.");
      setTriggerType("schedule");
      setSteps([
        {
          name: "Retrieve Security Advisories",
          type: "agent",
          agent_role: "Threat Intelligence Agent",
          description: "Gather the latest software vulnerability alerts and details from CVE databases and security feeds.",
          config: {}
        },
        {
          name: "Summarize Vulnerability Report",
          type: "agent",
          agent_role: "Security Summarizer",
          description: "Summarize findings and write a detailed markdown report outlining action items.",
          config: {}
        },
        {
          name: "Log Results to Google Sheets",
          type: "mcp_tool",
          description: "Append threat assessment score and log details to the team Google Sheet.",
          config: {"tool_name": "append_row_to_sheet"}
        }
      ]);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return alert("Workflow name is required.");
    onSave({
      name,
      description,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      steps
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-panel w-full max-w-4xl mx-auto rounded-2xl p-8 border-black/10 dark:border-white/10 shadow-2xl relative overflow-hidden mb-8"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-black/5 dark:border-white/5">
        <div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#529CCA]" />
            Build New Agentic Flow
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">Configure multi-agent steps, connect to GitLab MCP, and log to Google Sheets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["review", "solve", "threat"].map((temp) => (
            <button
              key={temp}
              onClick={() => handleLoadTemplate(temp)}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#fcfcfc] dark:bg-black text-zinc-700 dark:text-zinc-300 border border-black/10 dark:border-white/10 hover:border-[#529CCA]/50 hover:text-[#529CCA] transition-all cursor-pointer"
            >
              {temp === "review" ? "MR Review" : temp === "solve" ? "Issue Solver" : "Threat Scan"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Name & Description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Workflow Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitLab Code Auditor"
              className="w-full bg-[#fcfcfc] dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-[#529CCA] focus:ring-1 focus:ring-[#529CCA] transition-all text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Trigger Event</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as any)}
              className="w-full bg-[#fcfcfc] dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white outline-none focus:border-[#529CCA] focus:ring-1 focus:ring-[#529CCA] transition-all text-sm"
            >
              <option value="manual">Manual Execution</option>
              <option value="gitlab_mr">GitLab Merge Request Event</option>
              <option value="schedule">Scheduled Cron Task</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this pipeline is orchestrating..."
            rows={2}
            className="w-full bg-[#fcfcfc] dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-[#529CCA] focus:ring-1 focus:ring-[#529CCA] transition-all text-sm resize-none"
          />
        </div>

        {/* Steps Pipeline */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-zinc-800 dark:text-white uppercase tracking-wider">Workflow Steps ({steps.length})</h3>
            <button
              onClick={addStep}
              className="flex items-center gap-1 text-[11px] text-[#529CCA] font-bold hover:text-[#438bb8] transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Step
            </button>
          </div>

          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {steps.map((step, index) => (
                <motion.div
                  key={index}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                  className="glass-panel-light flex flex-col md:flex-row gap-4 p-5 rounded-xl border-black/5 dark:border-white/5 relative group"
                >
                  <div className="absolute right-4 top-4 flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-bold select-none group-hover:text-zinc-500">#{index + 1}</span>
                    {steps.length > 1 && (
                      <button
                        onClick={() => removeStep(index)}
                        className="text-zinc-400 hover:text-rose-500 p-1 rounded hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Step Name</label>
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => updateStep(index, { name: e.target.value })}
                          className="w-full bg-[#fcfcfc] dark:bg-black/30 border border-black/10 dark:border-white/5 rounded-lg px-3 py-2 text-zinc-900 dark:text-white outline-none focus:border-[#529CCA] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Step Type</label>
                        <select
                          value={step.type}
                          onChange={(e) => {
                            const type = e.target.value as any;
                            const updates: Partial<WorkflowStep> = { type };
                            if (type === "mcp_tool") {
                              updates.config = { tool_name: "gitlab_list_issues" };
                              updates.agent_role = "";
                            } else if (type === "agent") {
                              updates.agent_role = "Assistant";
                              updates.config = {};
                            } else {
                              updates.agent_role = "";
                              updates.config = {};
                            }
                            updateStep(index, updates);
                          }}
                          className="w-full bg-[#fcfcfc] dark:bg-black/30 border border-black/10 dark:border-white/5 rounded-lg px-3 py-2 text-zinc-900 dark:text-white outline-none focus:border-[#529CCA] text-xs"
                        >
                          <option value="agent">Autonomous Agent</option>
                          <option value="mcp_tool">MCP Tool Call</option>
                          <option value="manual_approval">Human Approval</option>
                        </select>
                      </div>
                      <div>
                        {step.type === "agent" && (
                          <>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Agent Role</label>
                            <input
                              type="text"
                              value={step.agent_role || ""}
                              onChange={(e) => updateStep(index, { agent_role: e.target.value })}
                              placeholder="e.g. Senior Reviewer"
                              className="w-full bg-[#fcfcfc] dark:bg-black/30 border border-black/10 dark:border-white/5 rounded-lg px-3 py-2 text-zinc-900 dark:text-white outline-none focus:border-[#529CCA] text-xs"
                            />
                          </>
                        )}

                        {step.type === "mcp_tool" && (
                          <>
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">MCP Tool Name</label>
                            <select
                              value={step.config.tool_name || ""}
                              onChange={(e) => updateStep(index, { config: { tool_name: e.target.value } })}
                              className="w-full bg-[#fcfcfc] dark:bg-black/30 border border-black/10 dark:border-white/5 rounded-lg px-3 py-2 text-zinc-900 dark:text-white outline-none focus:border-[#529CCA] text-xs"
                            >
                              <option value="gitlab_list_issues">gitlab_list_issues</option>
                              <option value="gitlab_get_mr_diff">gitlab_get_mr_diff</option>
                              <option value="gitlab_create_mr_comment">gitlab_create_mr_comment</option>
                              <option value="gitlab_create_merge_request">gitlab_create_merge_request</option>
                              <option value="append_row_to_sheet">google_sheets.append_row_to_sheet</option>
                            </select>
                          </>
                        )}

                        {step.type === "manual_approval" && (
                          <div className="pt-5 text-center text-xs font-semibold text-amber-500/90 flex items-center justify-center gap-1">
                            <UserCheck className="h-4 w-4" />
                            Halts run for approval
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Instructions / Description</label>
                      <textarea
                        value={step.description || ""}
                        onChange={(e) => updateStep(index, { description: e.target.value })}
                        placeholder="What should this step accomplish? E.g., 'Review security flaws and rate between 1-100'"
                        rows={2}
                        className="w-full bg-[#fcfcfc] dark:bg-black/30 border border-black/10 dark:border-white/5 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-[#529CCA] text-xs resize-none"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3 border-t border-black/5 dark:border-white/5 pt-6">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#529CCA] hover:bg-[#438bb8] text-white shadow-lg transition-all duration-200 cursor-pointer"
        >
          <Save className="h-4 w-4" />
          Save Workflow
        </button>
      </div>
    </motion.div>
  );
}
