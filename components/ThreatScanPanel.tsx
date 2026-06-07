"use client";

import React, { useState } from "react";

export default function ThreatScanPanel({ onReport }: { onReport?: (r: any) => void }) {
  const [repo, setRepo] = useState("");
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    setReport(null);
    setError(null);
    try {
      const res = await fetch("/api/py/workflows/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo }),
      });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const data = await res.json();
      setReport(data.report);
      onReport?.(data.report);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border-black/10 dark:border-white/10 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Threat Scan</h3>
        <span className="text-xs text-zinc-500">Quick repo safety scan</span>
      </div>

      <div className="space-y-3">
        <input
          placeholder="Local path or git URL (https://github.com/...)"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-sm"
        />

        <div className="flex gap-2">
          <button onClick={runScan} disabled={scanning || !repo} className="px-3 py-2 bg-[#529CCA] text-white rounded-xl text-sm font-bold">
            {scanning ? "Scanning..." : "Run Scan"}
          </button>
          <button onClick={() => { setRepo(''); setReport(null); setError(null) }} className="px-3 py-2 bg-black/5 rounded-xl text-sm">Clear</button>
        </div>

        {error && <div className="text-rose-500 text-sm">{error}</div>}

        {report && (
          <div className="mt-3 text-xs">
            <div className="font-bold">Scanned: {report.total_files_scanned} files</div>
            <div>Findings: {report.findings.length}</div>
            <div className="mt-2 max-h-48 overflow-auto border border-black/5 rounded-xl p-2 bg-black/5">
              {report.findings.length === 0 ? (
                <div className="text-zinc-500 italic">No quick issues found.</div>
              ) : (
                <ul className="list-disc pl-4 space-y-1">
                  {report.findings.slice(0, 50).map((f: any, i: number) => (
                    <li key={i}>
                      <span className="font-mono text-[11px]">{f.file}:{f.line}</span> — <strong>{f.match_type}</strong>
                      <div className="text-zinc-500 text-[11px]">{f.snippet}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
