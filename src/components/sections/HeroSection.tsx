import React, { useState } from "react";
import { Download, Terminal, Check, Copy } from "lucide-react";
import { Eyebrow } from "../ui/Eyebrow";
import { EditorialHeading } from "../ui/EditorialHeading";
import { PrimaryButton } from "../ui/PrimaryButton";
import { HeroProductDemo } from "../interactive/HeroProductDemo";

export const HeroSection: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const installCmd = "npm install -g @waitplay/cli";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="overview" className="w-full pt-32 sm:pt-36 md:pt-40 pb-16 sm:pb-24 px-5 sm:px-8 md:px-12 bg-[#FFFFEB]">
      <div className="max-w-[1240px] mx-auto text-center flex flex-col items-center">
        {/* Eyebrow */}
        <Eyebrow variant="lavender" dot className="mb-6 sm:mb-8">
          WAITPLAY 1.0 FOR CODING AGENTS
        </Eyebrow>

        {/* Editorial Headline */}
        <EditorialHeading as="h1" level="hero" className="max-w-[960px] mx-auto mb-6">
          Don’t stare at spinners, <em className="italic font-normal">just play.</em>
        </EditorialHeading>

        {/* Supporting Sans-Serif Copy */}
        <p className="font-sans text-[17px] sm:text-[19px] md:text-[21px] text-[#666666] max-w-[680px] mx-auto leading-[1.5] mb-8 sm:mb-10 font-normal">
          The zero-interruption gaming companion for AI coding agents. Play micro-games while your agent reasons, then seamlessly return to your diffs the millisecond it's done.
        </p>

        {/* CTA Group */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 w-full max-w-[520px] mb-5">
          <PrimaryButton
            size="lg"
            href="#download"
            icon={<Download className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            Download for Free
          </PrimaryButton>

          {/* Copyable Quick Install CLI Pill */}
          <button
            onClick={handleCopy}
            className="w-full sm:w-auto px-4 py-3.5 rounded-[12px] bg-[#FFFFFF] border border-[rgba(26,26,26,0.18)] hover:border-[rgba(26,26,26,0.35)] shadow-subtle flex items-center justify-between sm:justify-center gap-3 font-mono text-[13px] text-[#1A1A1A] transition-all cursor-pointer group"
            title="Click to copy quick install command"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-[#034F46]" />
              <span>{installCmd}</span>
            </div>
            <span className="p-1 rounded bg-[#E4E4D0]/60 group-hover:bg-[#E4E4D0] transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-[#034F46]" /> : <Copy className="w-3.5 h-3.5 text-[#666666]" />}
            </span>
          </button>
        </div>

        {/* Platform Availability Note */}
        <p className="font-sans text-[13px] sm:text-[14px] text-[#888888] font-medium mb-4">
          Available on Windows, macOS, and Linux • Works with Cursor, Claude Code, OMP & Codex
        </p>

        {/* Hero Interactive Product Demo */}
        <HeroProductDemo />
      </div>
    </section>
  );
};
