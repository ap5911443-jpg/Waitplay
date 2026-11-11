import React from "react";
import { AgentStatus } from "@waitplay/shared";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral";
  size?: "sm" | "md";
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  size = "md",
  pulse = false,
  children,
  className = "",
}) => {
  const variantStyles = {
    default: "bg-zinc-800 text-zinc-300 border-zinc-700",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    neutral: "bg-zinc-900 text-zinc-400 border-zinc-800",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
      )}
      {children}
    </span>
  );
};

export const AgentStatusBadge: React.FC<{ status: AgentStatus }> = ({ status }) => {
  switch (status) {
    case "IDLE":
      return <Badge variant="neutral">Idle</Badge>;
    case "WORKING":
      return (
        <Badge variant="info" pulse>
          Working
        </Badge>
      );
    case "GAME_ACTIVE":
      return (
        <Badge variant="success" pulse>
          Playing • Working
        </Badge>
      );
    case "WAITING_FOR_INPUT":
      return (
        <Badge variant="warning" pulse>
          Waiting for Input
        </Badge>
      );
    case "COMPLETED":
      return <Badge variant="success">Completed</Badge>;
    case "FAILED":
      return <Badge variant="danger">Failed</Badge>;
  }
};
