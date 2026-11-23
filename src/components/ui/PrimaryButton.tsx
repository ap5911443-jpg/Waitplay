import React from "react";

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  className?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  href,
  size = "md",
  icon,
  className = "",
  ...props
}) => {
  const sizeStyles = {
    sm: "px-4 py-2 text-[14px]",
    md: "px-5 py-2.5 sm:px-6 sm:py-3 text-[15px]",
    lg: "px-7 py-3.5 sm:px-8 sm:py-4 text-[16px]",
  };

  const baseClasses = `inline-flex items-center justify-center gap-2.5 font-sans font-semibold rounded-[12px] bg-[#F0D7FF] text-[#1A1A1A] border border-[#E8C4FF] shadow-[0_2px_8px_rgba(240,215,255,0.4)] hover:bg-[#E8C4FF] hover:shadow-[0_4px_16px_rgba(240,215,255,0.6)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer select-none text-center ${sizeStyles[size]} ${className}`;

  if (href) {
    return (
      <a href={href} className={baseClasses}>
        <span>{children}</span>
        {icon && <span className="transition-transform group-hover:translate-x-0.5">{icon}</span>}
      </a>
    );
  }

  return (
    <button className={baseClasses} {...props}>
      <span>{children}</span>
      {icon && <span className="transition-transform group-hover:translate-x-0.5">{icon}</span>}
    </button>
  );
};
