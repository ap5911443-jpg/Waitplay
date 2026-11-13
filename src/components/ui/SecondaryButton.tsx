import React from "react";

interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  variant?: "outline" | "solid" | "forest";
  className?: string;
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  children,
  href,
  size = "md",
  icon,
  variant = "outline",
  className = "",
  ...props
}) => {
  const sizeStyles = {
    sm: "px-4 py-2 text-[14px]",
    md: "px-5 py-2.5 sm:px-6 sm:py-3 text-[15px]",
    lg: "px-7 py-3.5 sm:px-8 sm:py-4 text-[16px]",
  };

  const variantStyles = {
    outline:
      "bg-transparent text-[#1A1A1A] border border-[rgba(26,26,26,0.22)] hover:bg-[#E4E4D0]/50 hover:border-[rgba(26,26,26,0.35)] shadow-sm",
    solid:
      "bg-[#FFFFFF] text-[#1A1A1A] border border-[rgba(26,26,26,0.12)] hover:bg-[#F5F5EA] hover:border-[rgba(26,26,26,0.25)] shadow-subtle",
    forest:
      "bg-transparent text-[#FFFFEB] border border-[rgba(255,255,235,0.3)] hover:bg-[#023932] hover:border-[rgba(255,255,235,0.6)] shadow-sm",
  };

  const baseClasses = `inline-flex items-center justify-center gap-2 font-sans font-semibold rounded-[12px] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer select-none text-center ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  if (href) {
    return (
      <a href={href} className={baseClasses}>
        <span>{children}</span>
        {icon && <span>{icon}</span>}
      </a>
    );
  }

  return (
    <button className={baseClasses} {...props}>
      <span>{children}</span>
      {icon && <span>{icon}</span>}
    </button>
  );
};
