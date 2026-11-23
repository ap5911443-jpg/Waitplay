import React from "react";

interface EditorialHeadingProps {
  as?: "h1" | "h2" | "h3" | "h4";
  level?: "hero" | "section" | "sub" | "card";
  children: React.ReactNode;
  className?: string;
  theme?: "light" | "forest";
}

export const EditorialHeading: React.FC<EditorialHeadingProps> = ({
  as: Component = "h2",
  level = "section",
  children,
  className = "",
  theme = "light",
}) => {
  const levelStyles = {
    hero: "text-[52px] sm:text-[68px] md:text-[88px] lg:text-[104px] leading-[0.98] tracking-[-0.025em]",
    section: "text-[38px] sm:text-[48px] md:text-[58px] lg:text-[68px] leading-[1.04] tracking-[-0.02em]",
    sub: "text-[28px] sm:text-[34px] md:text-[40px] leading-[1.12] tracking-[-0.015em]",
    card: "text-[22px] sm:text-[26px] md:text-[30px] leading-[1.2] tracking-[-0.01em]",
  };

  const themeStyles = {
    light: "text-[#1A1A1A]",
    forest: "text-[#FFFFEB]",
  };

  return (
    <Component
      className={`font-serif font-normal ${levelStyles[level]} ${themeStyles[theme]} ${className}`}
    >
      {children}
    </Component>
  );
};
