import React from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
  footer,
}) => {
  return (
    <div
      className={`bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden shadow-xs hover:border-zinc-700/80 transition-colors ${className}`}
    >
      {(title || icon || action) && (
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {icon && <div className="text-zinc-400">{icon}</div>}
            <div>
              {title && <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>}
              {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="flex items-center space-x-2">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-950/40 text-xs text-zinc-400">
          {footer}
        </div>
      )}
    </div>
  );
};
