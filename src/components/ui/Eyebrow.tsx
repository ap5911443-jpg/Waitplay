import React from "react";

interface EyebrowProps {
  children: React.ReactNode;
  variant?: "default" | "forest" | "lavender" | "orange";
  className?: string;
  dot?: boolean;
}

export const Eyebrow: React.FC<EyebrowProps> = ({
  children,
  variant = "default",
  className = "",
  dot = false,
}) => {
  const variantStyles = {
    default: "bg-[#E4E4D0]/60 text-[#1A1A1A] border border-[rgba(26,26,26,0.12)]",
    forest: "bg-[#023932] text-[#F0D7FF] border border-[rgba(240,215,255,0.25)]",
    lavender: "bg-[#F0D7FF]/50 text-[#1A1A1A] border border-[#E8C4FF]",
    orange: "bg-[#FFA946]/20 text-[#1A1A1A] border border-[#FFA946]/40",
  };

  const dotColors = {
    default: "bg-[#FFA946]",
    forest: "bg-[#00f3ff]",
    lavender: "bg-[#1A1A1A]",
    orange: "bg-[#FFA946]",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] sm:text-[12px] font-semibold tracking-wider uppercase ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className={`w-2 h-2 rounded-full ${dotColors[variant]} animate-pulse`} />
      )}
      <span>{children}</span>
    </div>
  );
};
