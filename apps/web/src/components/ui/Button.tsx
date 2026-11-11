import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  disabled,
  ...props
}) => {
  const variantStyles = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-xs focus:ring-blue-500",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 focus:ring-zinc-600",
    outline: "border border-zinc-700 hover:bg-zinc-800/80 text-zinc-300 focus:ring-zinc-600",
    danger: "bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500",
    ghost: "hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 focus:ring-zinc-700",
  };

  const sizeStyles = {
    sm: "px-2.5 py-1 text-xs rounded-md",
    md: "px-3.5 py-1.5 text-xs font-medium rounded-lg",
    lg: "px-4 py-2 text-sm font-medium rounded-lg",
  };

  return (
    <button
      className={`inline-flex items-center justify-center space-x-1.5 font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
};
