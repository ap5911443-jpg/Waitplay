import React from "react";
import { INTEGRATIONS } from "../../data/integrations";

export const LogoCloud: React.FC = () => {
  return (
    <section className="w-full py-12 sm:py-16 bg-[#E4E4D0]/50 border-y border-[rgba(26,26,26,0.08)] select-none">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 text-center">
        <p className="font-sans text-[12px] sm:text-[13px] font-semibold uppercase tracking-widest text-[#888888] mb-8">
          Seamlessly hooks into the world's leading coding agents & IDEs
        </p>

        {/* Logo Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4 items-center">
          {INTEGRATIONS.map((agent) => (
            <div
              key={agent.name}
              className="p-3.5 sm:p-4 rounded-[16px] bg-[#FFFFEB]/80 border border-[rgba(26,26,26,0.08)] hover:border-[rgba(26,26,26,0.2)] hover:bg-[#FFFFFF] transition-all duration-200 flex flex-col items-center justify-center text-center group shadow-subtle"
            >
              <div className="w-7 h-7 rounded-lg bg-[#1A1A1A] text-[#FFFFEB] flex items-center justify-center font-mono font-bold text-[12px] mb-2 group-hover:bg-[#034F46] transition-colors">
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-sans font-semibold text-[13px] text-[#1A1A1A] tracking-tight">
                {agent.name}
              </span>
              <span className="font-mono text-[10px] text-[#888888] mt-0.5">
                {agent.hookType.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
