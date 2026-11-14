import React from "react";
import { Terminal, Bot, Sparkles, Cpu, Layers, Code2, Globe } from "lucide-react";

export const LogoCloud: React.FC = () => {
  const ecosystems = [
    { name: "Claude Code", category: "Anthropic Terminal Agent", icon: Terminal },
    { name: "OpenAI Codex", category: "ChatGPT Code Execution", icon: Bot },
    { name: "OMP", category: "One More Prompt Orchestrator", icon: Sparkles },
    { name: "Cursor", category: "AI First Code Editor", icon: Code2 },
    { name: "Cline", category: "Autonomous Coding Agent", icon: Layers },
    { name: "OpenCode", category: "Local Open Source Agent", icon: Cpu },
    { name: "Antigravity", category: "Multi-Model Harness", icon: Globe },
    { name: "MCP Protocol", category: "Model Context Protocol", icon: Terminal },
  ];

  return (
    <section className="w-full py-12 border-y border-ink/10 bg-canvas-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 text-center space-y-6">
        <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-muted">
          Works natively across 8 major AI coding agent ecosystems
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 items-center">
          {ecosystems.map((eco, i) => {
            const Icon = eco.icon;
            return (
              <div
                key={i}
                className="group p-3 rounded-2xl bg-white/60 border border-ink/8 hover:border-ink/20 hover:bg-white hover:shadow-subtle transition-all flex flex-col items-center justify-center space-y-1.5"
                title={`${eco.name} • ${eco.category}`}
              >
                <div className="w-7 h-7 rounded-lg bg-canvas text-ink-soft group-hover:text-forest flex items-center justify-center transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-sans font-semibold text-ink-soft group-hover:text-ink transition-colors">
                  {eco.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
