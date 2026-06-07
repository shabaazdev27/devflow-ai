"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Settings, Activity, Cpu, CloudLightning, Key, Lock, Grid, HelpCircle } from "lucide-react";

import DashboardHeader from "@/components/DashboardHeader";
import WorkflowCard from "@/components/WorkflowCard";
import WorkflowBuilder from "@/components/WorkflowBuilder";
import WorkflowRunner from "@/components/WorkflowRunner";
import McpServerPanel from "@/components/McpServerPanel";
import GoogleSheetsPreview from "@/components/GoogleSheetsPreview";
import ThreatScanPanel from "@/components/ThreatScanPanel";
import { WorkflowResponse, WorkflowRunResponse } from "@/src/agents/types";

export default function HomePage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [runs, setRuns] = useState<WorkflowRunResponse[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  
  // Credentials and connection state
  const [geminiKey, setGeminiKey] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [sheetsId, setSheetsId] = useState("");
  
  const [sheetsRefreshTrigger, setSheetsRefreshTrigger] = useState(0);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: "info" | "success" | "error" } | null>(null);
  const [showGemini, setShowGemini] = useState(false);
  const [showGitlab, setShowGitlab] = useState(false);
  const [serviceAccountFile, setServiceAccountFile] = useState<File | null>(null);

  // Sync theme with HTML document class
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
  }, [theme]);

  // Fetch all workflows, settings, and runs on load
  const fetchData = async () => {
    try {
      // Fetch workflows
      const wRes = await fetch("/api/py/workflows");
      if (wRes.ok) {
        const wData = await wRes.json();
        setWorkflows(wData);
      }

      // Fetch runs
      const rRes = await fetch("/api/py/workflows/runs");
      if (rRes.ok) {
        const rData = await rRes.json();
        setRuns(rData);
      }

      // Fetch settings
      const sRes = await fetch("/api/py/workflows/settings/get");
      if (sRes.ok) {
        const sData = await sRes.json();
        sData.forEach((setting: any) => {
          if (setting.key === "gemini_api_key") setGeminiKey(setting.value || "");
          if (setting.key === "gitlab_access_token") setGitlabToken(setting.value || "");
          if (setting.key === "google_sheets_id") setSheetsId(setting.value || "");
        });
      }
    } catch (err) {
      console.error("Error loading application data:", err);
    } finally {
      setLoadingWorkflows(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save a single setting. Returns true on success.
  const handleSaveSetting = async (key: string, value: string) => {
    try {
      const res = await fetch("/api/py/workflows/settings/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      return true;
    } catch (e) {
      console.error("Failed to save setting:", e);
      return false;
    }
  };

  // Save all settings in one action and refresh data once.
  const saveAllSettings = async () => {
    setSaving(true);
    setToast(null);
    try {
      const results = await Promise.all([
        handleSaveSetting("gemini_api_key", geminiKey),
        handleSaveSetting("gitlab_access_token", gitlabToken),
        handleSaveSetting("google_sheets_id", sheetsId),
      ]);

      // Refresh saved settings from backend
      await fetchData();

      // Show basic toast about save status
      if (results.every((r) => r)) {
        setToast({ message: "All settings saved", type: "success" });
      } else {
        setToast({ message: "Some settings failed to save", type: "error" });
      }

      // Attempt live connection tests for GitLab and Google Sheets using the MCP endpoints
        try {
        // GitLab: validate token directly using the validation endpoint
        const gitlabValidate = await fetch("/api/py/mcp/gitlab-mcp-server/validate");
        let gitlabOk = false;
        let gitlabRaw: any = null;
        try {
          gitlabRaw = await gitlabValidate.json();
          gitlabOk = !!gitlabRaw?.success;
        } catch (parseErr) {
          gitlabOk = gitlabValidate.ok;
          gitlabRaw = { parseError: String(parseErr) };
        }

          // Sheets: call append_row_to_sheet to verify sheets id (if provided)
          let sheetsOk = false;
          let sheetsRaw: any = null;
          if (sheetsId) {
            const sheetsTest = await fetch("/api/py/mcp/google-sheets-mcp-server/tools/append_row_to_sheet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spreadsheet_id: sheetsId, range: "Sheet1!A1", values: ["devflow-test"] }),
            });
            try {
              sheetsRaw = await sheetsTest.json();
              sheetsOk = !!(sheetsRaw?.output?.status === "success" || sheetsRaw?.output?.rows_added);
            } catch (parseErr) {
              sheetsOk = sheetsTest.ok;
              sheetsRaw = { parseError: String(parseErr) };
            }
          }

          // Gemini: mark connected if geminiKey exists (external API call not implemented)
          const geminiOk = !!geminiKey;

          // Build a summarized toast
          const parts = [];
          parts.push(`Gemini: ${geminiOk ? "OK" : "Missing key"}`);
          parts.push(`GitLab: ${gitlabOk ? "OK" : "Failed"}`);
          parts.push(`Sheets: ${sheetsOk ? "OK" : sheetsId ? "Failed" : "Not set"}`);

          let message = parts.join(" • ");
          // Append raw details for failures to help debugging
          if (!gitlabOk) message += `\nGitLab Response: ${JSON.stringify(gitlabRaw)}`;
          if (sheetsId && !sheetsOk) message += `\nSheets Response: ${JSON.stringify(sheetsRaw)}`;

          setToast({ message, type: gitlabOk && (sheetsOk || !sheetsId) && geminiOk ? "success" : "info" });
        } catch (e) {
          console.error("Connection test failed:", e);
          setToast({ message: "Saved but connection tests encountered an error", type: "error" });
        }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWorkflow = async (workflow: any) => {
    try {
      const res = await fetch("/api/py/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflow)
      });
      if (res.ok) {
        setActiveTab("dashboard");
        fetchData();
      }
    } catch (err) {
      console.error("Error creating workflow:", err);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow and all its runs?")) return;
    try {
      const res = await fetch(`/api/py/workflows/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
        if (activeRunId) {
          const run = runs.find(r => r.id === activeRunId);
          if (run && run.workflow_id === id) {
            setActiveRunId(null);
          }
        }
      }
    } catch (err) {
      console.error("Error deleting workflow:", err);
    }
  };

  const handleRunWorkflow = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/py/workflows/${workflowId}/run`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setActiveRunId(data.id);
        fetchData();
      }
    } catch (err) {
      console.error("Error running workflow:", err);
    }
  };

  const triggerSheetsRefresh = () => {
    setSheetsRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen cyber-grid pb-12 flex flex-col transition-colors duration-300">
      
      {/* 1. Pitch-Black Geometric Cover Image */}
      <div className="relative w-full h-[120px] bg-black overflow-hidden border-b border-black/10 dark:border-white/5 flex items-center justify-center">
        <div className="absolute inset-0 opacity-15 pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="lines" width="40" height="40" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="40" y2="40" stroke="#529CCA" strokeWidth="1" />
                <line x1="40" y1="0" x2="0" y2="40" stroke="#529CCA" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#lines)" />
          </svg>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/80"></div>
      </div>

      {/* Navigation Header */}
      <DashboardHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        geminiConnected={!!geminiKey}
        gitlabConnected={!!gitlabToken}
        sheetsConnected={!!sheetsId}
        theme={theme}
        setTheme={setTheme}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 mt-6">
        
        {/* Workflow Runner Panel */}
        <AnimatePresence>
          {activeRunId && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8 overflow-hidden"
            >
              <WorkflowRunner
                runId={activeRunId}
                onClose={() => setActiveRunId(null)}
                onStatusChange={() => {
                  triggerSheetsRefresh();
                  fetchData();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Routers using Framer Motion */}
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-8"
            >
              
              {/* Page Title & Icon: Minimalist Page Icon (🔵) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="text-[#529CCA] text-3xl font-extrabold select-none">
                    🔵
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-[#529CCA] flex items-center gap-2 font-mono">
                      &gt;_ DevFlow AI : Central Command
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">Multi-agent orchestrator connecting GitLab repositories with Google Services.</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("builder")}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#529CCA] hover:bg-[#438bb8] text-white font-bold text-xs rounded-xl shadow-sm transition-all duration-200 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Build Custom Flow
                </button>
              </div>

              {/* High-visibility separation line */}
              <div className="select-none overflow-hidden h-4 flex items-center">
                <span className="text-[#529CCA] font-bold tracking-widest text-sm w-full block whitespace-nowrap opacity-60">
                  ________________________________________________________________________________________________________________________________________
                </span>
              </div>

              {/* 3-Column Layout for Pipelines */}
              {loadingWorkflows ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="glass-panel h-[240px] rounded-xl animate-pulse"></div>
                  ))}
                </div>
              ) : workflows.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center text-zinc-500 italic max-w-lg mx-auto border-black/10 dark:border-white/5">
                  No workflows created. Click the button above to load templates or build a custom workflow!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {workflows.map((workflow) => (
                    <WorkflowCard
                      key={workflow.id}
                      workflow={workflow}
                      onRun={handleRunWorkflow}
                      onDelete={handleDeleteWorkflow}
                      onSelect={(w) => handleRunWorkflow(w.id)}
                    />
                  ))}
                </div>
              )}

              {/* High-visibility separation line */}
              <div className="select-none overflow-hidden h-4 flex items-center">
                <span className="text-[#529CCA] font-bold tracking-widest text-sm w-full block whitespace-nowrap opacity-60">
                  ________________________________________________________________________________________________________________________________________
                </span>
              </div>

              {/* Google Sheets Preview (Inline Table Database Matrix) */}
              <GoogleSheetsPreview refreshTrigger={sheetsRefreshTrigger} />

              {/* Threat Scan Panel */}
              <div className="mt-6">
                <ThreatScanPanel />
              </div>

              {/* Execution History */}
              <div className="glass-panel rounded-2xl p-6 border-black/10 dark:border-white/10 shadow-xl">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-[#529CCA]" />
                  Recent Execution History
                </h3>
                <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/30">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-black/10 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 border-b border-black/10 dark:border-white/10">
                        <th className="p-3 font-semibold border-r border-black/10 dark:border-white/10">Workflow Name</th>
                        <th className="p-3 font-semibold border-r border-black/10 dark:border-white/10">Run ID</th>
                        <th className="p-3 font-semibold border-r border-black/10 dark:border-white/10">Trigger</th>
                        <th className="p-3 font-semibold border-r border-black/10 dark:border-white/10">Status</th>
                        <th className="p-3 font-semibold border-r border-black/10 dark:border-white/10">Executed At</th>
                        <th className="p-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-zinc-500 italic">
                            No execution records. Run a workflow to see logs.
                          </td>
                        </tr>
                      ) : (
                        runs.map((runItem) => {
                          const wf = workflows.find(w => w.id === runItem.workflow_id);
                          return (
                            <tr key={runItem.id} className="border-b border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 transition-colors">
                              <td className="p-3 font-bold text-zinc-950 dark:text-white border-r border-black/10 dark:border-white/10">{wf?.name || "Deleted Workflow"}</td>
                              <td className="p-3 font-mono text-zinc-500 text-[10px] border-r border-black/10 dark:border-white/10">{runItem.id.substring(0, 8)}...</td>
                              <td className="p-3 capitalize border-r border-black/10 dark:border-white/10">{wf?.trigger_type || "manual"}</td>
                              <td className="p-3 border-r border-black/10 dark:border-white/10">
                                <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                                  runItem.status === "COMPLETED" ? "bg-blue-500/10 text-[#529CCA] border-[#529CCA]/20" :
                                  runItem.status === "RUNNING" ? "bg-blue-500/10 text-[#529CCA] border-[#529CCA]/20 animate-pulse" :
                                  runItem.status === "PAUSED" ? "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20" :
                                  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                }`}>
                                  {runItem.status}
                                </span>
                              </td>
                              <td className="p-3 text-zinc-500 border-r border-black/10 dark:border-white/10">{new Date(runItem.created_at).toLocaleString()}</td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => setActiveRunId(runItem.id)}
                                  className="px-3 py-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white rounded-lg text-[10px] font-bold text-zinc-600 dark:text-zinc-300 transition-all cursor-pointer"
                                >
                                  View Log
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "builder" && (
            <motion.div
              key="builder"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <WorkflowBuilder
                onSave={handleCreateWorkflow}
                onCancel={() => setActiveTab("dashboard")}
              />
            </motion.div>
          )}

          {activeTab === "mcp" && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <McpServerPanel />
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="max-w-2xl mx-auto"
            >
              <div className="glass-panel p-8 rounded-2xl border-black/10 dark:border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute -left-20 -top-20 w-48 h-48 bg-[#529CCA]/10 rounded-full blur-3xl"></div>
                
                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-black/5 dark:border-white/5 pb-4 mb-6">
                  <Settings className="h-5 w-5 text-[#529CCA]" />
                  Integration Settings
                </h2>

                <div className="space-y-6">
                  {/* Gemini API Key */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Key className="h-4 w-4 text-[#529CCA]" />
                        Google Gemini API Key
                      </label>
                      <span className="text-[10px] text-zinc-500">For LLM-driven agents</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showGemini ? "text" : "password"}
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-850 dark:text-[#529CCA] placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-[#529CCA] text-sm font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGemini((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500"
                        aria-label="Toggle Gemini visibility"
                      >
                        {showGemini ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  {/* GitLab Access Token */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Lock className="h-4 w-4 text-[#529CCA]" />
                        GitLab Personal Access Token
                      </label>
                      <span className="text-[10px] text-zinc-500">For GitLab MCP actions</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showGitlab ? "text" : "password"}
                        value={gitlabToken}
                        onChange={(e) => setGitlabToken(e.target.value)}
                        placeholder="glpat-..."
                        className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-850 dark:text-[#529CCA] placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-[#529CCA] text-sm font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGitlab((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500"
                        aria-label="Toggle GitLab token visibility"
                      >
                        {showGitlab ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  {/* Google Sheets ID */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Grid className="h-4 w-4 text-[#529CCA]" />
                        Google Sheets Spreadsheet ID
                      </label>
                      <span className="text-[10px] text-zinc-500">For logging execution metrics</span>
                    </div>
                    <input
                      type="text"
                      value={sheetsId}
                      onChange={(e) => setSheetsId(e.target.value)}
                      placeholder="e.g. 1a2b3c4d5e..."
                      className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-850 dark:text-[#529CCA] placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-[#529CCA] text-sm font-mono"
                    />
                  </div>

                  {/* Service Account Upload */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CloudLightning className="h-4 w-4 text-[#529CCA]" />
                        Google Service Account (optional)
                      </label>
                      <span className="text-[10px] text-zinc-500">Upload JSON (stored encrypted on server)</span>
                    </div>
                    <input
                      type="file"
                      accept="application/json"
                      onChange={(e) => setServiceAccountFile(e.target.files ? e.target.files[0] : null)}
                      className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2 text-zinc-850 dark:text-[#529CCA] placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-[#529CCA] text-sm"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={async () => {
                          if (!serviceAccountFile) { alert('Select a JSON file first'); return }
                          try {
                            const text = await serviceAccountFile.text();
                            const parsed = JSON.parse(text);
                            const res = await fetch('/api/py/workflows/upload_service_account', {
                              method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(parsed)
                            });
                            if (res.ok) { setToast({ message: 'Service account uploaded (encrypted).', type: 'success' }) }
                            else { setToast({ message: 'Upload failed', type: 'error' }) }
                          } catch (err) {
                            setToast({ message: 'Invalid JSON file', type: 'error' })
                          }
                        }}
                        className="px-3 py-2 bg-[#529CCA] text-white rounded-xl text-xs font-bold"
                      >Upload</button>
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/py/workflows/service_account', { method: 'DELETE' });
                          if (res.ok) setToast({ message: 'Service account removed', type: 'success' });
                          else setToast({ message: 'Failed to remove', type: 'error' });
                        }}
                        className="px-3 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-bold"
                      >Remove</button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-4">
                  <div className="text-xs text-zinc-500">Modify values and click "Save All" or move focus away from a field to save individually.</div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveAllSettings}
                      disabled={saving}
                      className="px-4 py-2 bg-[#529CCA] hover:bg-[#438bb8] text-white font-bold text-xs rounded-xl shadow-sm transition-all duration-200 cursor-pointer"
                    >
                      {saving ? "Saving..." : "Save All"}
                    </button>
                    <button
                      onClick={fetchData}
                      className="px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-6 border-t border-black/5 dark:border-white/5 text-xs text-zinc-500 leading-relaxed flex items-start gap-2">
                  <HelpCircle className="h-4 w-4 text-zinc-400 shrink-0" />
                  <p>
                    Settings are saved automatically to the local SQLite database. If fields are empty, DevFlow AI runs in high-fidelity sandbox emulation mode, allowing you to try the full application without setting up external APIs.
                  </p>
                </div>
                {/* Toast */}
                {toast && (
                  <div className={`fixed right-6 bottom-6 z-50 rounded-xl p-4 shadow-lg text-sm ${toast.type === "success" ? "bg-green-600 text-white" : toast.type === "error" ? "bg-rose-600 text-white" : "bg-zinc-900 text-white"}`}>
                    {toast.message}
                    <button className="ml-3 text-xs underline" onClick={() => setToast(null)}>Dismiss</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
