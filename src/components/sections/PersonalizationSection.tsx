import React, { useState } from "react";
import { SectionContainer } from "../layout/SectionContainer";
import { Eyebrow } from "../ui/Eyebrow";
import { EditorialHeading } from "../ui/EditorialHeading";
import { Gamepad2, Clock, Move, Volume2, VolumeX, Check, Sparkles } from "lucide-react";

export const PersonalizationSection: React.FC = () => {
  const [selectedGame, setSelectedGame] = useState("memory");
  const [delayThreshold, setDelayThreshold] = useState(3);
  const [dockPosition, setDockPosition] = useState<"right" | "left" | "bottom" | "free">("right");
  const [audioEnabled, setAudioEnabled] = useState(true);

  const games = [
    { id: "memory", name: "Memory Match", icon: "🧠", time: "20–40s" },
    { id: "reaction", name: "Reaction Sprint", icon: "⚡", time: "10–25s" },
    { id: "math", name: "Math Blitz", icon: "🔢", time: "15–30s" },
    { id: "riddle", name: "Riddle Challenge", icon: "🧩", time: "30–60s" },
  ];

  const delays = [
    { value: 0, label: "0s Instant", desc: "Triggers on any tool execution" },
    { value: 3, label: "3s Smart", desc: "Recommended: skips fast 1-line queries" },
    { value: 5, label: "5s Deep", desc: "Only launches for heavy agent runs & test suites" },
  ];

  return (
    <SectionContainer id="personalize" bg="canvas-muted" className="overflow-hidden">
      <div className="text-center max-w-[840px] mx-auto mb-12 sm:mb-16">
        <Eyebrow variant="default" dot className="mb-4">
          CUSTOMIZATION & PREFERENCES
        </Eyebrow>

        <EditorialHeading level="section" className="mb-5">
          Built around <em className="italic font-normal">how you code,</em> not how we think you should.
        </EditorialHeading>

        <p className="font-sans text-[17px] sm:text-[19px] text-[#666666] leading-[1.6]">
          Fine-tune trigger delays, select preferred micro-games, choose screen docking edges, and calibrate sound effects to match your exact terminal workflow.
        </p>
      </div>

      {/* Interactive Settings Card Showcase */}
      <div className="max-w-[1080px] mx-auto bg-[#FFFFFF] rounded-[28px] p-6 sm:p-10 border border-[rgba(26,26,26,0.12)] shadow-card">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-7 space-y-7">
            {/* Setting 1: Game Choice */}
            <div>
              <label className="flex items-center gap-2 font-sans font-semibold text-[15px] text-[#1A1A1A] mb-3">
                <Gamepad2 className="w-4 h-4 text-[#034F46]" />
                Preferred Micro-Game
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {games.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGame(g.id)}
                    className={`p-3 rounded-[14px] text-left transition-all border flex items-center justify-between cursor-pointer ${
                      selectedGame === g.id
                        ? "bg-[#FFFFEB] border-[#034F46] shadow-sm text-[#1A1A1A]"
                        : "bg-[#FAFAF5] border-[rgba(26,26,26,0.08)] hover:bg-[#F0F0E5] text-[#666666]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{g.icon}</span>
                      <div>
                        <div className="font-sans font-semibold text-[13.5px] leading-tight">
                          {g.name}
                        </div>
                        <div className="text-[11px] text-[#888888]">{g.time}</div>
                      </div>
                    </div>
                    {selectedGame === g.id && (
                      <Check className="w-4 h-4 text-[#034F46]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 2: Start Delay Threshold */}
            <div>
              <label className="flex items-center gap-2 font-sans font-semibold text-[15px] text-[#1A1A1A] mb-3">
                <Clock className="w-4 h-4 text-[#034F46]" />
                Start Delay Threshold
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {delays.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDelayThreshold(d.value)}
                    className={`p-3 rounded-[14px] text-left transition-all border cursor-pointer ${
                      delayThreshold === d.value
                        ? "bg-[#F0D7FF] border-[#E8C4FF] text-[#1A1A1A] shadow-sm"
                        : "bg-[#FAFAF5] border-[rgba(26,26,26,0.08)] hover:bg-[#F0F0E5] text-[#666666]"
                    }`}
                  >
                    <div className="font-sans font-bold text-[13.5px] leading-tight">
                      {d.label}
                    </div>
                    <div className="text-[10.5px] text-[#666666] mt-1 leading-snug">
                      {d.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 3: Screen Docking Position */}
            <div>
              <label className="flex items-center gap-2 font-sans font-semibold text-[15px] text-[#1A1A1A] mb-3">
                <Move className="w-4 h-4 text-[#034F46]" />
                Desktop Widget Docking
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { pos: "right", label: "Right Edge" },
                    { pos: "left", label: "Left Edge" },
                    { pos: "bottom", label: "Bottom Dock" },
                    { pos: "free", label: "Free Float" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.pos}
                    onClick={() => setDockPosition(item.pos)}
                    className={`py-2 px-2.5 rounded-[12px] text-center text-[12.5px] font-semibold transition-all border cursor-pointer ${
                      dockPosition === item.pos
                        ? "bg-[#034F46] text-[#FFFFEB] border-[#023932]"
                        : "bg-[#FAFAF5] border-[rgba(26,26,26,0.08)] hover:bg-[#F0F0E5] text-[#666666]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Setting 4: Audio Haptics */}
            <div className="flex items-center justify-between pt-2">
              <span className="font-sans font-semibold text-[14.5px] text-[#1A1A1A] flex items-center gap-2">
                {audioEnabled ? <Volume2 className="w-4 h-4 text-[#034F46]" /> : <VolumeX className="w-4 h-4 text-[#888888]" />}
                Synthesized 8-Bit Audio Chimes
              </span>
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`w-12 h-6.5 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
                  audioEnabled ? "bg-[#034F46] justify-end" : "bg-[#CCCCCC] justify-start"
                }`}
              >
                <span className="w-4.5 h-4.5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </div>

          {/* Interactive Preview Panel */}
          <div className="lg:col-span-5 bg-[#FFFFEB] rounded-[24px] p-6 border border-[rgba(26,26,26,0.1)] flex flex-col justify-between h-full min-h-[380px]">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[rgba(26,26,26,0.1)]">
                <span className="text-[12px] font-mono uppercase tracking-wider text-[#888888]">
                  Live Configuration Preview
                </span>
                <span className="w-2 h-2 rounded-full bg-[#034F46]" />
              </div>

              <div className="space-y-4">
                <div className="p-3.5 rounded-[14px] bg-[#FFFFFF] border border-[rgba(26,26,26,0.08)]">
                  <div className="text-[11px] text-[#888888] uppercase">Active Game</div>
                  <div className="text-[16px] font-semibold text-[#1A1A1A] flex items-center gap-2 mt-0.5">
                    <span>{games.find((g) => g.id === selectedGame)?.icon}</span>
                    <span>{games.find((g) => g.id === selectedGame)?.name}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-[#FFFFFF] border border-[rgba(26,26,26,0.08)]">
                  <div className="text-[11px] text-[#888888] uppercase">Trigger Delay</div>
                  <div className="text-[16px] font-semibold text-[#034F46] mt-0.5">
                    {delayThreshold} seconds delay buffer
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-[#FFFFFF] border border-[rgba(26,26,26,0.08)]">
                  <div className="text-[11px] text-[#888888] uppercase">Docking Orientation</div>
                  <div className="text-[16px] font-semibold text-[#1A1A1A] capitalize mt-0.5">
                    Screen {dockPosition} edge
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[rgba(26,26,26,0.1)] text-[12.5px] text-[#666666] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FFA946]" />
              <span>Saved locally in <code>.waitplay-preferences.json</code></span>
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
};
