"use client";

import React, { useEffect, useState } from "react";
import { Database, Activity, Code, Play, RefreshCw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface McpServer {
  name: string;
  status: string;
  type: string;
  latency_ms: number;
  version: string;
  tools_count: number;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export default function McpServerPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [tools, setTools] = useState<McpTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [toolArgs, setToolArgs] = useState<string>("{\n  \"project_id\": \"sandbox-devflow/test-repo\"\n}");
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchServers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/py/mcp");
      if (res.ok) {
        const data = await res.json();
        setServers(data);
        if (data.length > 0) {
          setSelectedServer(data[0].name);
        }
      }
    } catch (err) {
      console.error("Error fetching MCP servers:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTools = async (serverName: string) => {
    if (!serverName) return;
    try {
      const res = await fetch(`/api/py/mcp/${serverName}/tools`);
      if (res.ok) {
        const data = await res.json();
        setTools(data);
        if (data.length > 0) {
          setSelectedTool(data[0].name);
          // Set default args based on the first tool
          if (data[0].name === "gitlab_list_issues") {
            setToolArgs(JSON.stringify({ project_id: "sandbox-devflow/test-repo", state: "opened" }, null, 2));
          } else if (data[0].name === "append_row_to_sheet") {
            setToolArgs(JSON.stringify({ spreadsheet_id: "default-metrics-sheet", range: "Sheet1!A1", values: ["GitLab Audit", "1", "82", "Approved"] }, null, 2));
          } else {
            setToolArgs(JSON.stringify({ project_id: "sandbox-devflow/test-repo" }, null, 2));
          }
        }
      }
    } catch (err) {
      console.error("Error fetching MCP tools:", err);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (selectedServer) {
      fetchTools(selectedServer);
    }
  }, [selectedServer]);

  const handleToolChange = (toolName: string) => {
    setSelectedTool(toolName);
    const tool = tools.find(t => t.name === toolName);
    if (!tool) return;

    // Prefill arguments based on tool schema
    const defaultArgs: Record<string, any> = {};
    if (tool.inputSchema && tool.inputSchema.properties) {
      Object.keys(tool.inputSchema.properties).forEach(propKey => {
        const prop = tool.inputSchema.properties[propKey];
        if (propKey === "project_id") defaultArgs[propKey] = "sandbox-devflow/test-repo";
        else if (propKey === "mr_iid") defaultArgs[propKey] = 42;
        else if (propKey === "issue_iid") defaultArgs[propKey] = 14;
        else if (propKey === "body") defaultArgs[propKey] = "LGTM! Ready to merge.";
        else if (propKey === "spreadsheet_id") defaultArgs[propKey] = "default-metrics-sheet";
        else if (prop.type === "array") defaultArgs[propKey] = [];
        else defaultArgs[propKey] = prop.default !== undefined ? prop.default : "";
      });
    }
    setToolArgs(JSON.stringify(defaultArgs, null, 2));
  };

  const handleExecuteTool = async () => {
    setExecuting(true);
    setExecutionResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArgs);
      } catch (e) {
        alert("Invalid JSON arguments");
        setExecuting(false);
        return;
      }

      const res = await fetch(`/api/py/mcp/${selectedServer}/tools/${selectedTool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedArgs)
      });
      const data = await res.json();
      setExecutionResult(data);
    } catch (err) {
      setExecutionResult({ error: "Failed to execute tool", details: err });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto mb-8 px-4">
      {/* MCP Servers List (Column 1) */}
      <div className="glass-panel lg:col-span-1 p-6 rounded-2xl border-black/10 dark:border-white/5 shadow-xl flex flex-col h-[600px] overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[#529CCA]" />
            <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">MCP Servers</h3>
          </div>
          <button
            onClick={fetchServers}
            disabled={loading}
            className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-zinc-650 dark:text-zinc-350 hover:text-zinc-950 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">
          {servers.map((server) => (
            <motion.div
              key={server.name}
              onClick={() => setSelectedServer(server.name)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                selectedServer === server.name
                  ? "bg-[#529CCA]/10 border-[#529CCA]/40 shadow-[0_0_12px_rgba(82,156,202,0.15)]"
                  : "bg-black/5 dark:bg-black/35 border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10 hover:bg-black/10 dark:hover:bg-black/45"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-850 dark:text-white">{server.name}</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    server.status === "connected"
                      ? "bg-[#529CCA]/15 text-[#529CCA] border-[#529CCA]/20"
                      : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${server.status === "connected" ? "bg-[#529CCA]" : "bg-zinc-400"}`} />
                  {server.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 font-mono">
                Type: <span className="text-zinc-700 dark:text-zinc-300 font-bold">{server.type}</span>
              </p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5 dark:border-white/5 text-[10px] text-zinc-500 dark:text-zinc-450">
                <span>Latency: {server.latency_ms}ms</span>
                <span>Tools registered: {server.tools_count}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tool Tester Console (Columns 2 & 3) */}
      <div className="glass-panel lg:col-span-2 p-6 rounded-2xl border-black/10 dark:border-white/5 shadow-xl flex flex-col h-[600px] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-black/5 dark:border-white/5 pb-4 mb-4">
          <Code className="h-5 w-5 text-[#529CCA]" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">MCP Tool Tester</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
          {/* Tool Selection and Parameters */}
          <div className="flex flex-col space-y-4 overflow-y-auto pr-1 custom-scrollbar">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Select Tool</label>
              <select
                value={selectedTool}
                onChange={(e) => handleToolChange(e.target.value)}
                className="w-full bg-[#fcfcfc] dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-zinc-900 dark:text-white outline-none focus:border-[#529CCA]/50 text-xs"
              >
                {tools.map((t) => (
                  <option key={t.name} value={t.name} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">{t.name}</option>
                ))}
              </select>
            </div>

            {selectedTool && (
              <div className="bg-black/5 dark:bg-black/35 rounded-xl p-3 border border-black/5 dark:border-white/5 text-[11px] text-zinc-650 dark:text-zinc-400 leading-relaxed">
                <span className="font-bold text-zinc-850 dark:text-white block mb-1">Description</span>
                {tools.find(t => t.name === selectedTool)?.description}
              </div>
            )}

            <div className="flex-1 flex flex-col min-h-[220px]">
              <label className="block text-[10px] font-bold text-zinc-550 dark:text-zinc-400 uppercase tracking-wider mb-2">Arguments (JSON)</label>
              <textarea
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                className="w-full flex-1 bg-[#fcfcfc] dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl p-3 text-zinc-900 dark:text-zinc-200 font-mono outline-none focus:border-[#529CCA]/50 text-xs resize-none custom-scrollbar"
              />
            </div>

            <button
              onClick={handleExecuteTool}
              disabled={executing || !selectedTool}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#529CCA] hover:bg-[#438bb8] text-white font-bold text-xs rounded-xl shadow-lg transition-all duration-200 disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {executing ? "Executing..." : "Execute Tool"}
            </button>
          </div>

          {/* Results Console */}
          <div className="flex flex-col bg-zinc-950 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden h-full terminal-console">
            <div className="bg-white/5 px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Execution Output</span>
              <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
            </div>
            <div className="flex-1 p-4 font-mono text-[11px] overflow-auto custom-scrollbar">
              {executionResult ? (
                <pre className="text-[#529CCA]/90 leading-relaxed">
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              ) : executing ? (
                <div className="h-full flex items-center justify-center text-zinc-500 gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-[#529CCA]" />
                  Sending instruction to {selectedServer}...
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center p-4">
                  <AlertCircle className="h-8 w-8 mb-2 stroke-1" />
                  <span>Execute a tool to view its payload response.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
