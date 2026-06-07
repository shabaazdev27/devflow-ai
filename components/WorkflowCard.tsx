"use client";

import React from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { Play, Trash2, Cpu } from "lucide-react";
import { WorkflowResponse } from "@/src/agents/types";

interface WorkflowCardProps {
  workflow: WorkflowResponse;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (workflow: WorkflowResponse) => void;
}

export default function WorkflowCard({
  workflow,
  onRun,
  onDelete,
  onSelect,
}: WorkflowCardProps) {
  // Motion values for tracking cursor position
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  // Map position to rotation angles
  const rotateX = useTransform(y, [0, 1], [12, -12]);
  const rotateY = useTransform(x, [0, 1], [-12, 12]);

  // Apply spring physics for ultra-smooth movement
  const springConfig = { stiffness: 250, damping: 25 };
  const rx = useSpring(rotateX, springConfig);
  const ry = useSpring(rotateY, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = (e.clientX - rect.left) / width;
    const mouseY = (e.clientY - rect.top) / height;
    x.set(mouseX);
    y.set(mouseY);
  };

  const handleMouseLeave = () => {
    x.set(0.5);
    y.set(0.5);
  };

  const getTriggerLabel = (type: string) => {
    switch (type) {
      case "gitlab_mr":
        return "⚡ GitLab MR Trigger";
      case "schedule":
        return "📅 Scheduled (Cron)";
      default:
        return "⚡ Manual Trigger";
    }
  };

  const getStatusText = (id: string) => {
    if (id === "vulnerability-news-synthesizer") return "Active";
    return "Idle";
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => onSelect(workflow)}
      style={{
        rotateX: rx,
        rotateY: ry,
        transformStyle: "preserve-3d",
      }}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="notion-callout cursor-pointer flex flex-col justify-between rounded-xl border-black/10 dark:border-white/10 bg-[#fcfcfc] dark:bg-black select-none shadow-md hover:border-[#529CCA]/55 dark:hover:border-[#529CCA]/55 group"
    >
      <div style={{ transform: "translateZ(20px)" }} className="flex-1">
        {/* Trigger Label & Trash */}
        <div className="flex justify-between items-start">
          <div className="text-xs font-bold text-[#529CCA] tracking-wide">
            {getTriggerLabel(workflow.trigger_type)}
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(workflow.id);
            }}
            className="text-zinc-400 dark:text-zinc-600 hover:text-rose-500 p-1 rounded hover:bg-rose-500/10 transition-colors"
            title="Delete Workflow"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Workflow Title */}
        <h3 className="mt-4 text-base font-extrabold text-zinc-900 dark:text-white group-hover:text-[#529CCA] transition-colors line-clamp-1">
          {workflow.name}
        </h3>

        {/* Description */}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed h-[36px]">
          {workflow.description || "No description provided."}
        </p>

        {/* Status code block */}
        <div className="mt-2.5">
          <code className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5 inline-block">
            Status: {getStatusText(workflow.id)}
          </code>
        </div>
      </div>

      <div style={{ transform: "translateZ(10px)" }} className="mt-4 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
          <Cpu className="h-3.5 w-3.5" />
          {workflow.steps.length} {workflow.steps.length === 1 ? "step" : "steps"}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRun(workflow.id);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#529CCA] hover:bg-[#438bb8] text-white font-bold text-[10px] rounded-lg shadow-sm transition-all duration-200 cursor-pointer"
        >
          <Play className="h-3 w-3 fill-current" />
          Execute Flow
        </button>
      </div>
    </motion.div>
  );
}
