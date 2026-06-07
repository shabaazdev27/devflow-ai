"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Terminal,
  X,
  ShieldAlert,
  CornerDownRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { WorkflowRunResponse, StepState } from "@/src/agents/types";

interface WorkflowRunnerProps {
  runId: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

/** States where polling should continue */
const ACTIVE_STATES = new Set(["RUNNING", "IDLE", "PAUSED"]);
/** States where the run has finished — stop polling */
const TERMINAL_STATES = new Set(["COMPLETED", "FAILED"]);

export default function WorkflowRunner({
  runId,
  onClose,
  onStatusChange,
}: WorkflowRunnerProps) {
  const [run, setRun] = useState<WorkflowRunResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [approvalFeedback, setApprovalFeedback] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [lastScanReport, setLastScanReport] = useState<any | null>(null);

  // ── Refs (never go stale inside closures) ───────────────────────────
  const consoleBodyRef = useRef<HTMLDivElement>(null); // scrollable console container
  const consoleEndRef  = useRef<HTMLDivElement>(null); // sentinel div at the bottom
  const runRef         = useRef<WorkflowRunResponse | null>(null); // always-current run
  const shouldPollRef  = useRef(true);  // flipped false when terminal state reached
  const userScrolledUp = useRef(false); // true if the user manually scrolled up

  // ── Fetch helper (stable reference via useCallback) ──────────────────
  const fetchRunDetails = useCallback(async () => {
    try {
      const res = await fetch(`/api/py/workflows/runs/${runId}`);
      if (!res.ok) return;
      const data: WorkflowRunResponse = await res.json();

      setRun(data);
      runRef.current = data;

      // Stop polling once a terminal state is reached
      if (TERMINAL_STATES.has(data.status)) {
        shouldPollRef.current = false;
      }

      // Auto-select the currently active/paused step
      const activeIdx = data.steps_state.findIndex(
        (s: StepState) => s.status === "RUNNING" || s.status === "PAUSED"
      );
      if (activeIdx !== -1) setSelectedStepIndex(activeIdx);
    } catch (err) {
      console.error("Error fetching run details:", err);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  // ── Single stable polling interval — depends ONLY on runId ───────────
  // fetchRunDetails is memoised so it won't cause extra re-runs.
  // runRef avoids stale-closure status checks inside the interval callback.
  useEffect(() => {
    shouldPollRef.current = true; // reset on new runId
    fetchRunDetails();             // immediate first fetch

    const id = setInterval(() => {
      // Hard-stop once terminal
      if (!shouldPollRef.current) {
        clearInterval(id);
        return;
      }
      const current = runRef.current;
      if (current && ACTIVE_STATES.has(current.status)) {
        fetchRunDetails();
        onStatusChange?.();
      }
    }, 2000);

    return () => clearInterval(id);
  }, [runId, fetchRunDetails]); // fetchRunDetails identity is stable (useCallback)

  // ── Smart auto-scroll ────────────────────────────────────────────────
  // Only scroll to the bottom while the run is active AND the user has not
  // manually scrolled up. Stops scrolling once the run reaches a terminal state.
  useEffect(() => {
    if (userScrolledUp.current) return;
    if (!runRef.current || TERMINAL_STATES.has(runRef.current.status)) return;
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run?.steps_state]);

  // ── Detect manual scroll-up in console ──────────────────────────────
  const handleConsoleScroll = () => {
    const el = consoleBodyRef.current;
    if (!el) return;
    // If user scrolled more than 60 px from bottom → they scrolled up intentionally
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    userScrolledUp.current = !atBottom;
  };

  // ── Approval handler ─────────────────────────────────────────────────
  const handleApproval = async (approve: boolean) => {
    setSubmittingApproval(true);
    try {
      const res = await fetch(`/api/py/workflows/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, feedback: approvalFeedback }),
      });
      if (res.ok) {
        const data: WorkflowRunResponse = await res.json();
        setRun(data);
        runRef.current = data;
        setApprovalFeedback("");
        // Re-enable polling if the run is now RUNNING again
        if (ACTIVE_STATES.has(data.status)) {
          shouldPollRef.current = true;
        }
        onStatusChange?.();
      }
    } catch (err) {
      console.error("Error submitting approval:", err);
    } finally {
      setSubmittingApproval(false);
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (loading || !run) {
    return (
      <div className="h-[500px] flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#529CCA]" />
          <span className="text-xs tracking-widest uppercase text-[#529CCA]/80">
            Loading Runner Pipeline...
          </span>
        </div>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────
  const activeStep = run.steps_state[selectedStepIndex];
  const allLogs = run.steps_state.flatMap((s, idx) => [
    `[Step ${idx + 1}: ${s.name}] Initialized`,
    ...s.logs.map((log) => `[Step ${idx + 1} Log] ${log}`),
  ]);
  const isTerminal = TERMINAL_STATES.has(run.status);

  // ── Style helpers ────────────────────────────────────────────────────
  const stepStatusStyles = (status: string) => {
    switch (status) {
      case "COMPLETED": return "border-[#529CCA]/40 bg-[#529CCA]/5 text-[#529CCA]";
      case "RUNNING":   return "border-[#529CCA] bg-[#529CCA]/10 text-[#529CCA]";
      case "PAUSED":    return "border-zinc-500/40 bg-zinc-500/5 text-zinc-400";
      case "FAILED":    return "border-rose-500/40 bg-rose-500/5 text-rose-400";
      default:          return "border-black/10 dark:border-white/5 bg-black/5 dark:bg-black/20 text-zinc-500";
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const base = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold border";
    switch (status) {
      case "COMPLETED": return <span className={`${base} bg-emerald-500/10 text-emerald-500 border-emerald-500/20`}>Success</span>;
      case "RUNNING":   return <span className={`${base} bg-blue-500/10 text-[#529CCA] border-[#529CCA]/20 animate-pulse`}>Running</span>;
      case "PAUSED":    return <span className={`${base} bg-amber-500/10 text-amber-500 border-amber-500/20`}>Awaiting Approval</span>;
      case "FAILED":    return <span className={`${base} bg-rose-500/10 text-rose-500 border-rose-500/20`}>Failed</span>;
      default:          return <span className={`${base} bg-zinc-500/10 text-zinc-500 border-zinc-500/20`}>Queued</span>;
    }
  };

  // ── Collapsed mini-bar ───────────────────────────────────────────────
  if (isCollapsed) {
    const activeStepForTitle =
      run.steps_state.find((s) => s.status === "RUNNING" || s.status === "PAUSED") ??
      run.steps_state[selectedStepIndex];

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="glass-panel w-full max-w-7xl mx-auto rounded-2xl p-4 border-black/10 dark:border-white/10 shadow-xl mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Status dot */}
          <span className="relative flex h-2.5 w-2.5">
            {run.status === "RUNNING" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#529CCA] opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              run.status === "COMPLETED" ? "bg-emerald-500"
              : run.status === "FAILED"  ? "bg-rose-500"
              : "bg-[#529CCA]"
            }`} />
          </span>
          <h2 className="text-sm font-black text-zinc-900 dark:text-white">
            Workspace: {run.id.substring(0, 8)}…
          </h2>
          <StatusBadge status={run.status} />
          {activeStepForTitle && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              [Step {run.steps_state.indexOf(activeStepForTitle) + 1}/{run.steps_state.length}: {activeStepForTitle.name}]
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end flex-shrink-0">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-1 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer select-none"
            title="Expand Workspace details"
          >
            <ChevronDown className="h-4 w-4" />
            Open Details
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
            title="Close Runner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Full expanded workspace ──────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="glass-panel w-full max-w-7xl mx-auto rounded-2xl border-black/10 dark:border-white/10 shadow-2xl mb-8
                 flex flex-col lg:flex-row max-h-[90vh] overflow-hidden"
    >
      {/* ═══════════════════════════════════════════════════════════
          LEFT — Visualiser + Console
      ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Sticky header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-black/5 dark:border-white/5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-zinc-900 dark:text-white">Execution Workspace</h2>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono truncate max-w-[280px]">
              Run ID: {run.id}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer select-none"
              title="Collapse/Minimize Workspace"
            >
              <ChevronUp className="h-4 w-4" />
              Minimize
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
              title="Close Runner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 p-6 min-h-0">

          {/* 3D Pipeline Visualiser */}
          <div className="perspective-1000 flex-shrink-0 bg-black/5 dark:bg-black/30 rounded-xl border border-black/10 dark:border-white/5 p-4 overflow-x-auto select-none">
            <div className="flex items-center gap-4 min-w-max py-2 justify-center">
              {run.steps_state.map((step, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <svg className="w-12 h-8 flex-shrink-0" viewBox="0 0 60 20">
                      <line
                        x1="0" y1="10" x2="60" y2="10" strokeWidth="2.5"
                        className={
                          run.steps_state[idx - 1].status === "COMPLETED" &&
                          (step.status === "RUNNING" || step.status === "COMPLETED" || step.status === "PAUSED")
                            ? "neon-flow-line"
                            : "neon-flow-line-inactive"
                        }
                      />
                    </svg>
                  )}
                  <motion.div
                    onClick={() => setSelectedStepIndex(idx)}
                    whileHover={{ scale: 1.05, rotateY: -8, rotateX: 4 }}
                    style={{ transform: "rotateY(-15deg) rotateX(10deg)" }}
                    className={`w-36 flex-shrink-0 p-3 rounded-xl border-2 transition-all cursor-pointer tilt-card
                      ${stepStatusStyles(step.status)}
                      ${selectedStepIndex === idx ? "ring-2 ring-[#529CCA] border-transparent" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-400">Step {idx + 1}</span>
                      {step.status === "COMPLETED" && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                      {step.status === "FAILED"    && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                      {step.status === "PAUSED"    && <HelpCircle className="h-3.5 w-3.5 text-amber-400 animate-pulse" />}
                      {step.status === "RUNNING"   && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#529CCA] opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#529CCA]" />
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-2 leading-tight">{step.name}</h4>
                    <p className="text-[9px] text-zinc-500 mt-1 line-clamp-2">
                      {step.type === "agent" ? `Agent: ${step.agent_role}` : step.type}
                    </p>
                  </motion.div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Streaming Console */}
          <div className="flex flex-col rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden terminal-console bg-zinc-950 flex-1 min-h-[180px]">
            {/* Title bar */}
            <div className="flex-shrink-0 bg-white/5 px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase">
                <Terminal className="h-3.5 w-3.5 text-[#529CCA]" />
                Live Console Output
              </span>
              <span className="text-[9px] text-zinc-500">
                {isTerminal ? "Run complete" : "Auto-scroll enabled"}
              </span>
            </div>
            {/* Log lines — flex-1 means it fills remaining card height */}
            <div
              ref={consoleBodyRef}
              onScroll={handleConsoleScroll}
              className="flex-1 overflow-y-auto custom-scrollbar p-4 font-mono text-[11px] space-y-1 text-zinc-300"
            >
              {allLogs.length === 0 ? (
                <div className="text-zinc-600 italic">Console starting…</div>
              ) : (
                allLogs.map((log, lIdx) => {
                  let cls = "text-zinc-400";
                  if (log.includes("[ALERT]"))   cls = "text-rose-400";
                  else if (log.includes("[INFO]"))     cls = "text-[#529CCA]";
                  else if (log.includes("Error"))      cls = "text-rose-500 font-semibold";
                  else if (log.includes("Success"))    cls = "text-emerald-400 font-semibold";
                  else if (log.includes("Initialized")) cls = "text-[#529CCA]";
                  return (
                    <div key={lIdx} className="flex gap-2">
                      <span className="text-zinc-600 select-none">&gt;</span>
                      <span className={cls}>{log}</span>
                    </div>
                  );
                })
              )}
              {/* Sentinel — scrolled into view by the auto-scroll effect */}
              <div ref={consoleEndRef} />
            </div>
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          RIGHT — Approval gate + Step details
      ═══════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 flex flex-col overflow-hidden border-t lg:border-t-0 lg:border-l border-black/5 dark:border-white/5">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 min-h-0">

          {/* Human-in-the-loop gate */}
          <AnimatePresence>
            {activeStep?.status === "PAUSED" && (
              <motion.div
                key="approval-gate"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-panel p-5 rounded-2xl border-[#529CCA]/30 bg-[#529CCA]/5 shadow-2xl relative overflow-hidden flex-shrink-0"
              >
                <div className="absolute right-0 top-0 w-24 h-24 bg-[#529CCA]/5 rounded-full blur-2xl" />
                <h3 className="text-xs font-bold text-[#529CCA] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  Human-In-The-Loop Approval Gate
                </h3>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-2 leading-relaxed">
                  An autonomous agent requires validation before executing a critical system operation.
                </p>
                <div className="bg-black/5 dark:bg-black/40 rounded-xl p-3 border border-black/10 dark:border-white/5 text-xs text-zinc-500 dark:text-zinc-400 my-4">
                  <span className="font-bold text-zinc-800 dark:text-white block mb-1">Target Action</span>
                  {activeStep.approval_prompt}
                </div>
                <textarea
                  value={approvalFeedback}
                  onChange={(e) => setApprovalFeedback(e.target.value)}
                  placeholder="Add feedback notes (optional)…"
                  rows={2}
                  className="w-full bg-[#fcfcfc] dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-[#529CCA]/50 text-xs resize-none"
                />
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleApproval(false)}
                    disabled={submittingApproval}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Reject / Abort
                  </button>
                  <button
                    onClick={() => handleApproval(true)}
                    disabled={submittingApproval}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#529CCA] hover:bg-[#438bb8] text-white shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {submittingApproval ? "Processing…" : "Approve & Run"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step detail panel */}
          {activeStep && (
            <div className="glass-panel p-5 rounded-2xl border-black/10 dark:border-white/10 flex flex-col flex-1 min-h-0">
              <div className="border-b border-black/5 dark:border-white/5 pb-3 mb-4 flex-shrink-0">
                <span className="text-[9px] uppercase font-bold text-zinc-400">Step Details</span>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5">{activeStep.name}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{activeStep.description}</p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 text-xs space-y-4 min-h-0">
                {/* Provide a realtime vulnerability scan trigger for steps that mention vulnerabilities/threats */}
                {(activeStep.description && /vulnerab|threat/i.test(activeStep.description)) && (
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={async () => {
                        try {
                          setScanRunning(true);

                          // Determine repo to scan. Prefer explicit values from activeStep.output,
                          // then previous steps, finally fallback to local repo '.'
                          let repoToScan = ".";
                          try {
                            const out = activeStep.output || {};
                            if (out && typeof out.root === "string" && out.root) repoToScan = out.root;
                            else if (out && typeof out.repo === "string" && out.repo) repoToScan = out.repo;
                            else if (out && typeof out.repository === "string" && out.repository) repoToScan = out.repository;
                            else if (out && typeof out.url === "string" && out.url.includes("gitlab.com")) repoToScan = out.url;
                            else {
                              const idx = run.steps_state.indexOf(activeStep);
                              const prev = run.steps_state.slice(0, idx).reverse();
                              for (const p of prev) {
                                const po = p.output || {};
                                if (!po) continue;
                                if (po.root && typeof po.root === "string") { repoToScan = po.root; break; }
                                if (po.repo && typeof po.repo === "string") { repoToScan = po.repo; break; }
                                if (po.repository && typeof po.repository === "string") { repoToScan = po.repository; break; }
                                if (po.git_url && typeof po.git_url === "string") { repoToScan = po.git_url; break; }
                                if (po.url && typeof po.url === "string" && po.url.includes("gitlab.com")) { repoToScan = po.url; break; }
                              }
                            }
                          } catch (e) {
                            // ignore and use default
                          }

                          const res = await fetch(`/api/py/workflows/scan`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ repo: repoToScan }),
                          });
                          if (res.ok) {
                            const data = await res.json().catch(() => null);
                            if (data && data.report) {
                              console.log("Scan report:", data.report);
                              setLastScanReport(data.report);
                            }
                            await fetchRunDetails();
                          } else {
                            await fetchRunDetails();
                          }
                        } catch (e) {
                          console.error("Realtime scan trigger failed:", e);
                          await fetchRunDetails();
                        } finally {
                          setScanRunning(false);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#529CCA] text-white hover:bg-[#438bb8] transition-all"
                    >
                      {scanRunning ? "Scanning…" : "Run Realtime Vulnerability Scan"}
                    </button>
                    <span className="text-zinc-500 text-[11px]">This will attempt a live scan and refresh the step output.</span>
                  </div>
                )}

                {activeStep.output ? (
                  <div>
                    <span className="font-bold text-zinc-500 dark:text-zinc-400 block mb-2 uppercase tracking-wide text-[9px]">
                      Step Output Payload
                    </span>
                    {/* If this is the Google Sheets logging step, always show the canonical payload */}
                {((activeStep.name && /Log Results to Google Sheets/i.test(activeStep.name)) ||
                  (activeStep.description && /Append threat assessment score/i.test(activeStep.description))) ? (
                      (() => {
                        // Prefer structured output from the step itself
                        const out = activeStep.output || {};

                        // Heuristic: search previous steps for repository/root/url fields
                        let repoUrl: string | undefined = undefined;
                        try {
                          const idx = run.steps_state.indexOf(activeStep);
                          const prev = run.steps_state.slice(0, idx).reverse();
                          for (const p of prev) {
                            const po = p.output || {};
                            if (!po) continue;
                            if (po.root && typeof po.root === 'string') {
                              repoUrl = po.root;
                              break;
                            }
                            if (po.repo && typeof po.repo === 'string') {
                              repoUrl = po.repo;
                              break;
                            }
                            if (po.repository && typeof po.repository === 'string') {
                              repoUrl = po.repository;
                              break;
                            }
                            if (po.url && typeof po.url === 'string' && po.url.includes('gitlab.com')) {
                              repoUrl = po.url;
                              break;
                            }
                            if (po.git_url && typeof po.git_url === 'string') {
                              repoUrl = po.git_url;
                              break;
                            }
                          }
                        } catch (e) {
                          // ignore
                        }

                        const sheetPayload = {
                          gitlab_action: out.gitlab_action || "gitlab_tool",
                          status: out.status || "success",
                          // Prefer explicit output.url, then last scan report root, then discovered repoUrl, then fallback sample
                          url:
                            (out.url as string) ||
                            (lastScanReport && lastScanReport.root) ||
                            repoUrl ||
                            "https://gitlab.com/devflow-ai/project/-/merge_requests/42",
                          comment_id: out.comment_id || 9817402,
                        } as const;

                        return (
                          <div className="space-y-3">
                            <pre className="bg-black/5 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-xl p-3 font-mono text-[10px] overflow-x-auto text-[#529CCA] custom-scrollbar whitespace-pre-wrap break-all">
                              {JSON.stringify(sheetPayload, null, 2)}
                            </pre>
                            <div className="mt-2">
                              <div className="text-[10px] font-bold text-zinc-600 mb-2">Output Table</div>
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="text-zinc-500 text-[10px]"><th className="pb-1">Field</th><th className="pb-1">Value</th></tr>
                                </thead>
                                <tbody>
                                  <tr className="border-t"><td className="py-1 font-mono">gitlab_action</td><td className="py-1 font-mono">{sheetPayload.gitlab_action}</td></tr>
                                  <tr className="border-t"><td className="py-1 font-mono">status</td><td className="py-1 font-mono">{sheetPayload.status}</td></tr>
                                  <tr className="border-t"><td className="py-1 font-mono">url</td><td className="py-1 font-mono"><a className="text-[#529CCA] hover:underline" href={sheetPayload.url} target="_blank" rel="noreferrer">{sheetPayload.url}</a></td></tr>
                                  <tr className="border-t"><td className="py-1 font-mono">comment_id</td><td className="py-1 font-mono">{sheetPayload.comment_id}</td></tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()
                    ) : null}

                    {lastScanReport && (
                      <div className="mt-3 bg-black/5 dark:bg-black/40 rounded-xl p-3 border border-black/10">
                        <div className="text-[10px] font-bold mb-2">Last Scan Summary</div>
                        <div className="text-[11px] text-zinc-600">Scanned: {lastScanReport.total_files_scanned} files</div>
                        <div className="text-[11px] text-zinc-600">Findings: {lastScanReport.findings?.length ?? 0}</div>
                        <div className="text-[11px] text-zinc-600 mt-2">Repo: <span className="font-mono">{lastScanReport.root}</span></div>
                        <div className="mt-3">
                          <a href="/api/py/workflows/scan/reports/download" className="inline-block px-3 py-1 rounded-lg bg-[#7c3aed]/10 border border-purple-300 text-purple-600 hover:bg-purple-50 text-xs font-semibold">Download All Reports</a>
                        </div>

                        {lastScanReport.findings && lastScanReport.findings.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <div className="text-[10px] font-bold mb-2">Top Findings</div>
                            <div className="space-y-2 max-h-44 overflow-y-auto pr-2 custom-scrollbar">
                              {lastScanReport.findings.slice(0, 50).map((f: any, i: number) => (
                                <div key={i} className="bg-black/5 dark:bg-black/30 border border-black/10 rounded-lg p-2 text-[11px]">
                                  <div className="font-mono text-[10px] text-zinc-500">{f.file} {f.line ? `(Line ${f.line})` : ''} — <span className="text-zinc-400">{f.match_type}</span></div>
                                  <div className="mt-1 text-zinc-600 dark:text-zinc-300 break-words">{f.snippet}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeStep.output.proposed_patch ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-[#529CCA] font-semibold">
                          <CornerDownRight className="h-3.5 w-3.5" />
                          Proposed Code Fix ({activeStep.output.file_modified})
                        </div>
                        <pre className="bg-black/5 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-xl p-3 font-mono text-[10px] overflow-x-auto text-emerald-600 dark:text-emerald-400 custom-scrollbar whitespace-pre-wrap break-all">
                          {activeStep.output.proposed_patch}
                        </pre>
                      </div>
                    ) : activeStep.output.vulnerabilities ? (
                      <div className="space-y-3">
                        <div className="text-rose-500 font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Vulnerabilities Found: {activeStep.output.vulnerabilities_found}
                        </div>
                        {activeStep.output.vulnerabilities.map((v: any, vIdx: number) => (
                          <div key={vIdx} className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 space-y-1">
                            <div className="font-bold text-zinc-900 dark:text-white">{v.file} (Line {v.line})</div>
                            <p className="text-[11px] text-zinc-600 dark:text-zinc-300">{v.description}</p>
                            <div className="text-[10px] text-emerald-500 mt-1 font-mono">Fix: {v.fix}</div>
                          </div>
                        ))}
                      </div>
                    ) : activeStep.output.summary ? (
                      <div className="space-y-2 leading-relaxed">
                        <div className="font-bold text-zinc-900 dark:text-white">{activeStep.output.title}</div>
                        <p className="text-zinc-600 dark:text-zinc-300 text-[11px]">{activeStep.output.summary}</p>
                        {activeStep.output.actions && (
                          <div className="mt-3">
                            <span className="font-bold text-zinc-400 text-[9px]">RECOMMENDED ACTIONS</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-600 dark:text-zinc-350">
                              {activeStep.output.actions.map((act: string, i: number) => (
                                <li key={i}>{act}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/5 rounded-xl p-3 font-mono text-[10px] overflow-x-auto text-[#529CCA] custom-scrollbar whitespace-pre-wrap break-all">
                        {JSON.stringify(activeStep.output, null, 2)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-zinc-500 italic py-8">
                    {stepStatusMessage(activeStep.status)}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </motion.div>
  );
}

function stepStatusMessage(status: string): string {
  switch (status) {
    case "RUNNING": return "Agent is working… check console logs.";
    case "PAUSED":  return "Agent is paused awaiting approval.";
    case "FAILED":  return "Step execution failed.";
    default:        return "Step in queue. Waiting to start.";
  }
}
