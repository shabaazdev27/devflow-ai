"use client";

import React, { useState } from "react";
import {
  Terminal,
  Settings,
  Layers,
  Database,
  Activity,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  geminiConnected: boolean;
  gitlabConnected: boolean;
  sheetsConnected: boolean;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}

const NAV_TABS = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "builder",   label: "Flow Builder", icon: Layers },
  { id: "mcp",       label: "MCP Servers",  icon: Database },
  { id: "settings",  label: "Settings",     icon: Settings },
] as const;

export default function DashboardHeader({
  activeTab,
  setActiveTab,
  geminiConnected,
  gitlabConnected,
  sheetsConnected,
  theme,
  setTheme,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  /* ── shared badge builder ─────────────────────────────────── */
  const badge = (
    connected: boolean,
    label: string,
    title: string,
    extraClass = ""
  ) => (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border select-none ${extraClass} ${
        connected
          ? "bg-[#529CCA]/10 text-[#529CCA] border-[#529CCA]/20"
          : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-[#529CCA]" : "bg-zinc-400"
        }`}
      />
      {label}
    </span>
  );

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          Main header bar
      ════════════════════════════════════════════════════════════ */}
      <header className="glass-panel sticky top-4 z-40 mx-auto my-4 w-full max-w-7xl rounded-2xl shadow-2xl">
        {/* ── top row (always visible) ─────────────────────────── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">

          {/* Logo */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl bg-black dark:bg-black/60 border border-[#529CCA]/40 shadow-[0_0_12px_rgba(82,156,202,0.15)]">
              <Terminal className="h-4 w-4 sm:h-5 sm:w-5 text-[#529CCA]" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#529CCA] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#529CCA]" />
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-1 select-none leading-tight">
                DevFlow <span className="text-[#529CCA] font-extrabold">AI</span>
              </h1>
              <p className="hidden xs:block text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">
                Agentic Workflow Orchestrator
              </p>
            </div>
          </div>

          {/* ── Desktop nav (md+) ─────────────────────────────── */}
          <nav
            aria-label="Main navigation"
            className="hidden md:flex items-center gap-1 bg-black/5 dark:bg-black/25 rounded-xl p-1 border border-black/5 dark:border-white/5 relative"
          >
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer select-none ${
                    isActive
                      ? "text-[#529CCA] dark:text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeHeaderTab"
                      className="absolute inset-0 bg-[#529CCA]/10 dark:bg-white/5 border border-[#529CCA]/20 dark:border-white/10 rounded-lg shadow-inner"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="h-4 w-4 relative z-10 flex-shrink-0" />
                  {/* Hide labels on md, show on lg */}
                  <span className="relative z-10 hidden lg:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Right controls ────────────────────────────────── */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Integration badges — hidden on mobile, minimal on sm/md */}
            <div className="hidden sm:flex items-center gap-1.5">
              {/* On sm–md show dot-only; lg+ show full label */}
              <span
                title={geminiConnected ? "Connected to Google Gemini" : "Gemini: Sandbox"}
                className={`hidden lg:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border select-none ${
                  geminiConnected
                    ? "bg-[#529CCA]/10 text-[#529CCA] border-[#529CCA]/20"
                    : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${geminiConnected ? "bg-[#529CCA]" : "bg-zinc-400"}`} />
                Gemini
              </span>
              {/* Dot-only on sm–md */}
              <span
                title={geminiConnected ? "Gemini: Connected" : "Gemini: Sandbox"}
                className={`lg:hidden h-2 w-2 rounded-full border ${geminiConnected ? "bg-[#529CCA] border-[#529CCA]/40" : "bg-zinc-400 border-zinc-400/40"}`}
              />

              <span
                title={gitlabConnected ? "Connected to GitLab" : "GitLab: Sandbox"}
                className={`hidden lg:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border select-none ${
                  gitlabConnected
                    ? "bg-[#529CCA]/10 text-[#529CCA] border-[#529CCA]/20"
                    : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${gitlabConnected ? "bg-[#529CCA]" : "bg-zinc-400"}`} />
                GitLab MCP
              </span>
              <span
                title={gitlabConnected ? "GitLab: Connected" : "GitLab: Sandbox"}
                className={`lg:hidden h-2 w-2 rounded-full border ${gitlabConnected ? "bg-[#529CCA] border-[#529CCA]/40" : "bg-zinc-400 border-zinc-400/40"}`}
              />

              <span
                title={sheetsConnected ? "Connected to Google Sheets" : "Sheets: Mock"}
                className={`hidden lg:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border select-none ${
                  sheetsConnected
                    ? "bg-[#529CCA]/10 text-[#529CCA] border-[#529CCA]/20"
                    : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:text-zinc-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${sheetsConnected ? "bg-[#529CCA]" : "bg-zinc-400"}`} />
                Sheets
              </span>
              <span
                title={sheetsConnected ? "Sheets: Connected" : "Sheets: Mock"}
                className={`lg:hidden h-2 w-2 rounded-full border ${sheetsConnected ? "bg-[#529CCA] border-[#529CCA]/40" : "bg-zinc-400 border-zinc-400/40"}`}
              />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-all shadow-inner cursor-pointer flex-shrink-0"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-blue-500" />
              )}
            </button>

            {/* Hamburger — mobile only (< md) */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all cursor-pointer flex-shrink-0"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Mobile drawer nav ──────────────────────────────────
            Slides down inside the glass panel below the top row
        ─────────────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {mobileOpen && (
            <motion.div
              key="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden md:hidden"
            >
              <div className="border-t border-black/5 dark:border-white/5 px-4 pb-4 pt-3 flex flex-col gap-1">
                {NAV_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`nav-tab-mobile-${tab.id}`}
                      onClick={() => handleTabClick(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer text-left ${
                        isActive
                          ? "bg-[#529CCA]/10 text-[#529CCA] border border-[#529CCA]/20"
                          : "text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}

                {/* Integration status in drawer */}
                <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 flex items-center gap-2 flex-wrap">
                  {badge(
                    geminiConnected,
                    "Gemini",
                    geminiConnected ? "Connected to Google Gemini" : "Gemini: Sandbox"
                  )}
                  {badge(
                    gitlabConnected,
                    "GitLab MCP",
                    gitlabConnected ? "Connected to GitLab" : "GitLab: Sandbox"
                  )}
                  {badge(
                    sheetsConnected,
                    "Sheets",
                    sheetsConnected ? "Connected to Google Sheets" : "Sheets: Mock"
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
