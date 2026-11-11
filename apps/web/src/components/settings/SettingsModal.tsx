import React, { useState } from "react";
import {
  Settings,
  Monitor,
  Layout,
  Volume2,
  VolumeX,
  Clock,
  Flame,
  PauseCircle,
  Sun,
  Moon,
  RotateCcw,
} from "lucide-react";
import { UserPreferences, DEFAULT_PREFERENCES, GameCategory, GameDifficulty, DisplayMode } from "@waitplay/shared";
import { Modal } from "../ui/Modal";

export interface SettingsModalProps {
  isOpen: boolean;
  preferences: UserPreferences;
  onClose: () => void;
  onSavePreferences: (updated: UserPreferences) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  preferences,
  onClose,
  onSavePreferences,
}) => {
  const [prefs, setPrefs] = useState<UserPreferences>(preferences);

  const handleDisplayModeChange = (mode: DisplayMode) => {
    const updated = { ...prefs, displayMode: mode };
    setPrefs(updated);
    onSavePreferences(updated);
  };

  const handleDifficultyChange = (diff: GameDifficulty) => {
    const updated = { ...prefs, difficulty: diff };
    setPrefs(updated);
    onSavePreferences(updated);
  };

  const handleCategoryToggle = (category: GameCategory) => {
    const exists = prefs.preferredCategories.includes(category);
    let next: GameCategory[];
    if (exists) {
      // Keep at least memory
      next = prefs.preferredCategories.filter((c) => c !== category);
      if (next.length === 0) next = ["memory"];
    } else {
      next = [...prefs.preferredCategories, category];
    }
    const updated = { ...prefs, preferredCategories: next };
    setPrefs(updated);
    onSavePreferences(updated);
  };

  const handleToggle = (key: keyof UserPreferences) => {
    const current = prefs[key];
    if (typeof current === "boolean") {
      const updated = { ...prefs, [key]: !current };
      setPrefs(updated);
      onSavePreferences(updated);
    }
  };

  const handleStartDelayChange = (seconds: number) => {
    const updated = { ...prefs, startDelaySeconds: Math.max(0, Math.min(30, seconds)) };
    setPrefs(updated);
    onSavePreferences(updated);
  };

  const handleResultsDurationChange = (seconds: number) => {
    const updated = { ...prefs, resultsDurationSeconds: Math.max(0, Math.min(30, seconds)) };
    setPrefs(updated);
    onSavePreferences(updated);
  };

  const handleResetDefaults = () => {
    setPrefs(DEFAULT_PREFERENCES);
    onSavePreferences(DEFAULT_PREFERENCES);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preferences & Behavior"
      subtitle="Configure auto-launch rules, display mode, and gameplay parameters."
      maxWidth="lg"
    >
      <div className="space-y-6 text-xs text-zinc-300">
        {/* Display Mode */}
        <div>
          <label className="block text-xs font-semibold text-zinc-200 mb-2">
            Display Mode
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDisplayModeChange("compact")}
              className={`flex items-start p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                prefs.displayMode === "compact"
                  ? "bg-blue-600/10 border-blue-500/50 text-blue-400"
                  : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-400"
              }`}
            >
              <Layout className="w-5 h-5 mr-2.5 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-zinc-100">Compact Floating Panel</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Docked in corner. Minimizable with active telemetry.
                </div>
              </div>
            </button>

            <button
              onClick={() => handleDisplayModeChange("fullscreen")}
              className={`flex items-start p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                prefs.displayMode === "fullscreen"
                  ? "bg-blue-600/10 border-blue-500/50 text-blue-400"
                  : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-400"
              }`}
            >
              <Monitor className="w-5 h-5 mr-2.5 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-zinc-100">Full-Screen Overlay</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Full browser viewport with agent progress header.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Auto Launch & Delays */}
        <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-zinc-200">Auto-Launch During Inference</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Automatically opens a mini-game when Claude Code starts working.
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.autoLaunch}
              onChange={() => handleToggle("autoLaunch")}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-zinc-900 border-zinc-700"
            />
          </div>

          {prefs.autoLaunch && (
            <div className="pt-3 border-t border-zinc-800/80 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5 font-medium text-zinc-300">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>Start Delay: <strong>{prefs.startDelaySeconds}s</strong></span>
                  </div>
                  <span className="text-[10px] text-zinc-500">Default: 4 seconds</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  value={prefs.startDelaySeconds}
                  onChange={(e) => handleStartDelayChange(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  Tasks finishing before this delay will not open the game.
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-zinc-300">
                    Results Screen Duration: <strong>{prefs.resultsDurationSeconds}s</strong>
                  </span>
                  <span className="text-[10px] text-zinc-500">0 = Stay open</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={prefs.resultsDurationSeconds}
                  onChange={(e) => handleResultsDurationChange(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Gameplay Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-200 mb-2">
              Memory Game Difficulty
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["easy", "medium", "hard"] as GameDifficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => handleDifficultyChange(d)}
                  className={`py-2 px-2 text-center rounded-lg border capitalize font-medium transition-colors cursor-pointer ${
                    prefs.difficulty === d
                      ? "bg-blue-600/10 border-blue-500 text-blue-400"
                      : "bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  {d}
                  <span className="block text-[10px] text-zinc-500 font-normal">
                    {d === "easy" ? "6 pairs" : d === "medium" ? "8 pairs" : "10 pairs"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-200 mb-2">
              Sound Effects
            </label>
            <button
              onClick={() => handleToggle("soundEnabled")}
              className={`w-full py-2.5 px-3 rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${
                prefs.soundEnabled
                  ? "bg-blue-600/10 border-blue-500/50 text-blue-400"
                  : "bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center space-x-2">
                {prefs.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="font-medium text-zinc-200">
                  {prefs.soundEnabled ? "Synthesized Sound Enabled" : "Muted"}
                </span>
              </div>
              <span className="text-[11px] font-mono">{prefs.soundEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        {/* Agent Interaction Rules */}
        <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-start space-x-2.5">
              <PauseCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-zinc-200">Pause on Input Request</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Temporarily pause active gameplay when Claude Code requests user confirmation or tool permissions.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.pauseOnInputRequired}
              onChange={() => handleToggle("pauseOnInputRequired")}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-zinc-900 border-zinc-700"
            />
          </div>
        </div>

        {/* Categories Preference */}
        <div>
          <label className="block text-xs font-semibold text-zinc-200 mb-1">
            Game Categories
          </label>
          <p className="text-[11px] text-zinc-400 mb-2">
            Playable games matching selected categories will be launched. Unfinished placeholder games are excluded.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "memory" as GameCategory, label: "Memory Matching", ready: true },
              { id: "reaction" as GameCategory, label: "Reaction Test", ready: false },
              { id: "riddle" as GameCategory, label: "Riddle Challenge", ready: false },
              { id: "math" as GameCategory, label: "Math Sprint", ready: false },
            ].map((cat) => {
              const isSelected = prefs.preferredCategories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryToggle(cat.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
                    isSelected
                      ? "bg-blue-600/10 border-blue-500/50 text-blue-300"
                      : "bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  }`}
                >
                  <span>{cat.label}</span>
                  {!cat.ready && (
                    <span className="text-[9px] px-1 py-0.2 bg-zinc-800 text-zinc-400 rounded">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={handleResetDefaults}
            className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};
