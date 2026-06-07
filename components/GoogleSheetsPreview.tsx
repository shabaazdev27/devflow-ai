"use client";

import React, { useEffect, useState } from "react";
import { Grid, Trash2, RefreshCw } from "lucide-react";
import { MockSheetRow } from "@/src/agents/types";

interface GoogleSheetsPreviewProps {
  refreshTrigger: number;
}

export default function GoogleSheetsPreview({ refreshTrigger }: GoogleSheetsPreviewProps) {
  const [rows, setRows] = useState<MockSheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/py/workflows/sheets/mock");
      if (res.ok) {
        const data = await res.json();
        setRows(data);
      }
    } catch (err) {
      console.error("Error fetching mock sheets data:", err);
    } finally {
      setLoading(false);
    }
  };

  const clearSheet = async () => {
    if (!confirm("Are you sure you want to clear the Google Sheet logs?")) return;
    try {
      const res = await fetch("/api/py/workflows/sheets/mock", { method: "DELETE" });
      if (res.ok) {
        setRows([]);
      }
    } catch (err) {
      console.error("Error clearing sheet:", err);
    }
  };

  useEffect(() => {
    fetchRows();
  }, [refreshTrigger]);

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return isoStr;
    }
  };

  const getStatusTag = (status: string) => {
    const normStatus = status.toLowerCase();
    if (normStatus === "completed" || normStatus === "active" || normStatus === "running") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-[#529CCA] border border-[#529CCA]/20">
          Success
        </span>
      );
    } else if (normStatus === "failed" || normStatus === "error") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
          Failed
        </span>
      );
    } else {
      // Default / Pending
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/10">
          Pending
        </span>
      );
    }
  };

  return (
    <div className="glass-panel w-full rounded-2xl p-6 border-black/10 dark:border-white/10 shadow-xl relative overflow-hidden">
      <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/5 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#529CCA]/10 text-[#529CCA] border border-[#529CCA]/20">
            <Grid className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-zinc-950 dark:text-white uppercase tracking-wider">Google Sheets Integration Preview</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Inline Database Table with matrix view</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchRows}
            disabled={loading}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
            title="Refresh Sheet"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={clearSheet}
            className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
            title="Clear Sheet Records"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid Matrix Table */}
      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/45">
        <table className="w-full text-left border-collapse text-xs table-fixed min-w-[700px]">
          <thead>
            <tr className="bg-black/10 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border-b border-black/10 dark:border-white/10">
              <th className="p-3 font-semibold border-r border-black/10 dark:border-r-white/10 w-16 text-center">Row</th>
              <th className="p-3 font-semibold border-r border-black/10 dark:border-r-white/10 w-32">Timestamp</th>
              <th className="p-3 font-semibold border-r border-black/10 dark:border-r-white/10">Workflow</th>
              <th className="p-3 font-semibold border-r border-black/10 dark:border-r-white/10 w-36 text-center">Vulnerabilities</th>
              <th className="p-3 font-semibold border-r border-black/10 dark:border-r-white/10 w-32 text-center">Audit Score</th>
              <th className="p-3 font-semibold text-center w-40">Execution Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500 italic">
                  Spreadsheet is empty. Run a workflow to populate metrics.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="hover:bg-black/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-300 transition-colors">
                  <td className="p-3 text-zinc-500 border-r border-black/10 dark:border-r-white/10 text-center">{index + 1}</td>
                  <td className="p-3 border-r border-black/10 dark:border-r-white/10">{formatDate(row.timestamp)}</td>
                  <td className="p-3 border-r border-black/10 dark:border-r-white/10 font-bold text-zinc-950 dark:text-white">{row.workflow}</td>
                  <td className="p-3 border-r border-black/10 dark:border-r-white/10 text-center">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {row.vulnerabilities}
                    </span>
                  </td>
                  <td className="p-3 border-r border-black/10 dark:border-r-white/10 text-center font-bold text-[#529CCA]">{row.score}%</td>
                  <td className="p-3 text-center">{getStatusTag(row.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
