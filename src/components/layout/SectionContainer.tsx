import React from "react";

interface SectionContainerProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  bleed?: boolean;
  bg?: "canvas" | "canvas-muted" | "forest" | "white";
}

export const SectionContainer: React.FC<SectionContainerProps> = ({
  children,
  className = "",
  id,
  bleed = false,
  bg = "canvas",
}) => {
  const bgClasses = {
    canvas: "bg-[#FFFFEB] text-[#1A1A1A]",
    "canvas-muted": "bg-[#E4E4D0] text-[#1A1A1A]",
    forest: "bg-[#034F46] text-[#FFFFEB]",
    white: "bg-[#FFFFFF] text-[#1A1A1A]",
  };

  return (
    <section id={id} className={`w-full ${bgClasses[bg]} transition-colors duration-300`}>
      <div
        className={`${
          bleed ? "w-full" : "max-w-[1280px] mx-auto"
        } px-5 sm:px-8 md:px-12 lg:px-16 py-16 sm:py-20 md:py-24 lg:py-28 ${className}`}
      >
        {children}
      </div>
    </section>
  );
};
