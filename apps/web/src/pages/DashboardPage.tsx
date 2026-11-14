import React, { useState } from "react";
import {
  Gamepad2,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Sparkles,
  Film,
  Tv,
} from "lucide-react";
import { UserPreferences, GameScoreRecord } from "@waitplay/shared";
import { useBridgeConnection } from "../hooks/useBridgeConnection";
import { useAgentStateMachine } from "../hooks/useAgentStateMachine";
import { AgentStatusCard } from "../components/dashboard/AgentStatusCard";
import { ConnectionCard } from "../components/dashboard/ConnectionCard";
import { SessionCard } from "../components/dashboard/SessionCard";
import { RecentScoresCard } from "../components/dashboard/RecentScoresCard";
import { SimulatorCard } from "../components/dashboard/SimulatorCard";
import { CompactGamePanel } from "../components/game/CompactGamePanel";
import { FullScreenGameModal } from "../components/game/FullScreenGameModal";
import { GameResultModal } from "../components/game/GameResultModal";
import { SettingsModal } from "../components/settings/SettingsModal";

export interface DashboardPageProps {
  preferences: UserPreferences;
  onUpdatePreferences: (updated: UserPreferences) => void;
  onOpenShowcase?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  preferences,
  onUpdatePreferences,
  onOpenShowcase,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isPopup =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).get("popup") === "1" ||
      new URLSearchParams(window.location.search).get("popup") === "true" ||
      new URLSearchParams(window.location.search).get("mode") === "fullscreen");

  const [overrideDisplayMode, setOverrideDisplayMode] = useState<"compact" | "fullscreen" | null>(
    isPopup ? "fullscreen" : null
  );
  const [companionTab, setCompanionTab] = useState<"games" | "instagram" | "youtube">("instagram");
  const bridge = useBridgeConnection({
    onStateChange: (enabled) => {
      if (preferences.companionEnabled !== enabled) {
        onUpdatePreferences({ ...preferences, companionEnabled: enabled });
      }
    },
  });

  const stateMachine = useAgentStateMachine(
    bridge.activeSession,
    preferences,
    (_payload) => {
      // Event processed
    }
  );

  const activeDisplayMode = overrideDisplayMode ?? preferences.displayMode;

  const handleToggleTheme = () => {
    const nextTheme = preferences.theme === "dark" ? "light" : "dark";
    onUpdatePreferences({ ...preferences, theme: nextTheme });
  };

  const handleGameComplete = (score: GameScoreRecord) => {
    stateMachine.recordFinishedGame(score);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-sm text-zinc-100">WaitPlay</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                Claude Code Companion
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Interactive micro-games while your AI coding agent works
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenShowcase && !isPopup && (
            <button
              onClick={onOpenShowcase}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-ink bg-lavender hover:bg-lavender-hover border border-ink/20 transition-all cursor-pointer shadow-subtle"
              title="Return to Wispr Flow Showcase Website"
            >
              <Sparkles className="w-3.5 h-3.5 text-forest" />
              <span>Showcase Website</span>
            </button>
          )}
          <button
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            title="Toggle Theme"
          >
            {preferences.theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Popup View Waiting Screen */}
      {isPopup && !stateMachine.isGameOpen && !stateMachine.isResultsOpen && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center animate-pulse shadow-lg">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">WaitPlay for Codex</h2>
            <p className="text-xs text-zinc-400 max-w-sm mt-1">
              {stateMachine.status === "WORKING"
                ? "Codex is reasoning... Starting game now!"
                : "Waiting for Codex prompt to begin..."}
            </p>
          </div>
          <button
            onClick={stateMachine.openGameManually}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg transition-all cursor-pointer"
          >
            Play Now
          </button>
        </div>
      )}

      {/* Main Dashboard Body */}
      {!isPopup && (
        <>
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
            {/* Companion Experience Quick Launcher */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">AI Waiting Experiences</h3>
                  <p className="text-xs text-zinc-400">Authentic social entertainment while your coding agent reasons</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full md:w-auto">
                <button
                  onClick={() => {
                    setCompanionTab("instagram");
                    stateMachine.openGameManually();
                  }}
                  className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#833ab4]/20 via-[#fd1d1d]/20 to-[#fcb045]/20 hover:from-[#833ab4]/30 hover:via-[#fd1d1d]/30 hover:to-[#fcb045]/30 border border-[#fd1d1d]/30 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <Film className="w-4 h-4 text-[#fd1d1d]" />
                  <span>Instagram (Reels & Feed)</span>
                </button>

                <button
                  onClick={() => {
                    setCompanionTab("youtube");
                    stateMachine.openGameManually();
                  }}
                  className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-3.5 py-2 rounded-xl bg-[#CC0000]/15 hover:bg-[#CC0000]/25 border border-[#CC0000]/30 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <Tv className="w-4 h-4 text-[#CC0000]" />
                  <span>YouTube</span>
                </button>

                <button
                  onClick={() => {
                    setCompanionTab("games");
                    stateMachine.openGameManually();
                  }}
                  className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-3.5 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <Gamepad2 className="w-4 h-4 text-blue-400" />
                  <span>Micro-Games</span>
                </button>
              </div>
            </div>

            {/* Row 1: Agent Telemetry & Connection */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AgentStatusCard
                  status={stateMachine.status}
                  taskElapsedSeconds={stateMachine.currentTaskElapsedSeconds}
                  delayRemainingSeconds={stateMachine.delayRemainingSeconds}
                  waitingForInputPrompt={bridge.activeSession?.waitingForInputPrompt}
                  lastError={bridge.activeSession?.lastError}
                  onOpenGame={stateMachine.openGameManually}
                  isGameOpen={stateMachine.isGameOpen}
                />
              </div>
              <div>
                <ConnectionCard
                  status={bridge.status}
                  health={bridge.health}
                  latencyMs={bridge.latencyMs}
                  hasActiveSession={bridge.sessions.length > 0}
                  bridgeToken={bridge.bridgeToken}
                  onReconnect={bridge.reconnect}
                />
              </div>
            </div>

            {/* Row 2: Session & Recent Scores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SessionCard
                sessions={bridge.sessions}
                activeSession={bridge.activeSession}
                onSelectSession={bridge.selectSession}
              />
              <RecentScoresCard />
            </div>

            {/* Row 3: Simulator Control Panel */}
            <div>
              <SimulatorCard
                onSimulateEvent={stateMachine.processEvent}
                sendToBridge={bridge.sendEventToBridge}
                isBridgeConnected={bridge.status === "connected"}
              />
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t border-zinc-800/80 px-4 sm:px-8 py-4 text-center text-xs text-zinc-500">
            WaitPlay • Browser-based gaming companion for AI coding agents • Localhost companion bridge
          </footer>
        </>
      )}
      {/* Compact Floating Game Mode */}
      {stateMachine.isGameOpen && activeDisplayMode === "compact" && (
        <CompactGamePanel
          isOpen={stateMachine.isGameOpen}
          isMinimized={stateMachine.isGameMinimized}
          agentStatus={stateMachine.status}
          taskElapsedSeconds={stateMachine.currentTaskElapsedSeconds}
          preferences={preferences}
          isPaused={stateMachine.isPaused}
          initialTab={companionTab}
          onToggleMinimize={stateMachine.toggleMinimize}
          onSwitchToFullscreen={() => setOverrideDisplayMode("fullscreen")}
          onClose={stateMachine.closeGameManually}
          onGameComplete={handleGameComplete}
        />
      )}

      {/* Full-Screen Game Mode */}
      {stateMachine.isGameOpen && activeDisplayMode === "fullscreen" && (
        <FullScreenGameModal
          isOpen={stateMachine.isGameOpen}
          agentStatus={stateMachine.status}
          taskElapsedSeconds={stateMachine.currentTaskElapsedSeconds}
          preferences={preferences}
          isPaused={stateMachine.isPaused}
          initialTab={companionTab}
          onExitFullscreen={() => setOverrideDisplayMode("compact")}
          onClose={stateMachine.closeGameManually}
          onGameComplete={handleGameComplete}
        />
      )}

      {/* Results Screen Modal */}
      <GameResultModal
        isOpen={stateMachine.isResultsOpen}
        scoreRecord={stateMachine.lastScore}
        agentResponseTimeSeconds={stateMachine.currentTaskElapsedSeconds}
        onDismiss={stateMachine.dismissResults}
        onPlayAgain={stateMachine.openGameManually}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        preferences={preferences}
        onClose={() => setIsSettingsOpen(false)}
        onSavePreferences={onUpdatePreferences}
      />
    </div>
  );
};
