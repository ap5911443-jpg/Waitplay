import { useState, useEffect, useRef, useCallback } from "react";
import {
  AgentEvent,
  AgentEventPayload,
  AgentSessionInfo,
  AgentStatus,
  UserPreferences,
  GameScoreRecord,
} from "@waitplay/shared";
import { recordScore } from "../store/gameHistory";

export interface AgentStateMachineHookResult {
  status: AgentStatus;
  isGameOpen: boolean;
  isGameMinimized: boolean;
  isPaused: boolean;
  isResultsOpen: boolean;
  lastScore: GameScoreRecord | null;
  delayRemainingSeconds: number | null;
  currentTaskElapsedSeconds: number;
  openGameManually: () => void;
  closeGameManually: () => void;
  toggleMinimize: () => void;
  dismissResults: () => void;
  processEvent: (event: AgentEvent, data?: Record<string, unknown>) => void;
  recordFinishedGame: (score: GameScoreRecord) => void;
}

export function useAgentStateMachine(
  activeSession: AgentSessionInfo | null,
  preferences: UserPreferences,
  onEventProcessed?: (payload: AgentEventPayload) => void
): AgentStateMachineHookResult {
  const isPopup =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).get("popup") === "1" ||
      new URLSearchParams(window.location.search).get("popup") === "true");

  const [status, setStatus] = useState<AgentStatus>(isPopup ? "GAME_ACTIVE" : (activeSession?.status ?? "IDLE"));
  const [isGameOpen, setIsGameOpen] = useState<boolean>(isPopup);
  const [isGameMinimized, setIsGameMinimized] = useState<boolean>(false);
  const [isResultsOpen, setIsResultsOpen] = useState<boolean>(false);
  const [lastScore, setLastScore] = useState<GameScoreRecord | null>(null);
  const [delayRemainingSeconds, setDelayRemainingSeconds] = useState<number | null>(null);
  const [currentTaskElapsedSeconds, setCurrentTaskElapsedSeconds] = useState<number>(0);

  const hasEverBeenActiveRef = useRef<boolean>(false);
  const launchTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const delayCountdownIntervalRef = useRef<NodeJS.Timeout | number | null>(null);
  const taskTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const resultsDismissTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  // Sync with incoming activeSession from bridge if present
  useEffect(() => {
    if (activeSession && activeSession.status !== status) {
      // Remote session update from bridge
      handleStatusTransition(activeSession.status);
    }
  }, [activeSession]);

  const clearLaunchTimers = useCallback(() => {
    clearTimeout(launchTimerRef.current as NodeJS.Timeout);
    clearInterval(delayCountdownIntervalRef.current as NodeJS.Timeout);
    launchTimerRef.current = null;
    delayCountdownIntervalRef.current = null;
    setDelayRemainingSeconds(null);
  }, []);

  const handleStatusTransition = useCallback(
    (newStatus: AgentStatus) => {
      setStatus(newStatus);

      switch (newStatus) {
        case "IDLE": {
          clearLaunchTimers();
          break;
        }

        case "WORKING": {
          clearLaunchTimers();
          clearTimeout(resultsDismissTimerRef.current as NodeJS.Timeout);
          setIsResultsOpen(false);

          // Start task elapsed timer
          hasEverBeenActiveRef.current = true;
          setCurrentTaskElapsedSeconds(0);
          const isPopup =
            typeof window !== "undefined" &&
            (new URLSearchParams(window.location.search).get("popup") === "1" ||
              new URLSearchParams(window.location.search).get("popup") === "true");

          if (preferences.autoLaunch || isPopup) {
            const delay = isPopup ? 0 : preferences.startDelaySeconds;
            if (delay <= 0) {
              setStatus("GAME_ACTIVE");
              setIsGameOpen(true);
            } else {
              setDelayRemainingSeconds(delay);

              // Countdown display
              let remaining = delay;
              delayCountdownIntervalRef.current = setInterval(() => {
                remaining -= 1;
                if (remaining > 0) {
                  setDelayRemainingSeconds(remaining);
                } else {
                  clearInterval(delayCountdownIntervalRef.current as NodeJS.Timeout);
                  delayCountdownIntervalRef.current = null;
                  setDelayRemainingSeconds(null);
                }
              }, 1000);

              launchTimerRef.current = setTimeout(() => {
                clearLaunchTimers();
                setStatus("GAME_ACTIVE");
                setIsGameOpen(true);
              }, delay * 1000);
            }
          }
          break;
        }

        case "GAME_ACTIVE": {
          clearLaunchTimers();
          setIsGameOpen(true);
          break;
        }

        case "WAITING_FOR_INPUT": {
          clearLaunchTimers();
          break;
        }

        case "COMPLETED": {
          clearLaunchTimers();

          const isPopup =
            typeof window !== "undefined" &&
            (new URLSearchParams(window.location.search).get("popup") === "1" ||
              new URLSearchParams(window.location.search).get("popup") === "true");

          if (hasEverBeenActiveRef.current) {
            hasEverBeenActiveRef.current = false;
            setIsGameOpen(false);
            setIsResultsOpen(true);

            const duration = isPopup ? 2 : preferences.resultsDurationSeconds;
            if (duration > 0) {
              clearTimeout(resultsDismissTimerRef.current as NodeJS.Timeout);
              resultsDismissTimerRef.current = setTimeout(() => {
                setIsResultsOpen(false);
                if (isPopup) {
                  try {
                    window.close();
                  } catch {}
                }
              }, duration * 1000);
            } else if (isPopup) {
              try {
                window.close();
              } catch {}
            }
          }
          break;
        }

        case "FAILED": {
          clearLaunchTimers();
          if (isGameOpen) {
            setIsGameOpen(false);
          }
          break;
        }
      }
    },
    [preferences, clearLaunchTimers, isGameOpen]
  );

  // Track task elapsed time while in WORKING or GAME_ACTIVE
  useEffect(() => {
    if (status === "WORKING" || status === "GAME_ACTIVE") {
      taskTimerRef.current = setInterval(() => {
        setCurrentTaskElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(taskTimerRef.current as NodeJS.Timeout);
    }

    return () => {
      clearInterval(taskTimerRef.current as NodeJS.Timeout);
    };
  }, [status]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      clearLaunchTimers();
      clearInterval(taskTimerRef.current as NodeJS.Timeout);
      clearTimeout(resultsDismissTimerRef.current as NodeJS.Timeout);
    };
  }, [clearLaunchTimers]);

  const processEvent = useCallback(
    (event: AgentEvent, data?: Record<string, unknown>) => {
      const sessionId = activeSession?.sessionId || "default-session";
      const agent = activeSession?.agent || "codex";
      const payload: AgentEventPayload = {
        agent,
        sessionId,
        event,
        timestamp: Date.now(),
        data,
      };

      if (onEventProcessed) {
        onEventProcessed(payload);
      }

      switch (event) {
        case "session_started":
          handleStatusTransition("IDLE");
          break;
        case "task_started":
          handleStatusTransition("WORKING");
          break;
        case "task_running":
          if (status === "IDLE") {
            handleStatusTransition("WORKING");
          } else if (status === "WAITING_FOR_INPUT") {
            handleStatusTransition(isGameOpen ? "GAME_ACTIVE" : "WORKING");
          }
          break;
        case "waiting_for_input":
          handleStatusTransition("WAITING_FOR_INPUT");
          break;
        case "task_completed":
          handleStatusTransition("COMPLETED");
          break;
        case "task_failed":
          handleStatusTransition("FAILED");
          break;
        case "session_ended":
          handleStatusTransition("IDLE");
          break;
      }
    },
    [activeSession, onEventProcessed, handleStatusTransition, status, isGameOpen]
  );

  const openGameManually = useCallback(() => {
    setIsGameOpen(true);
    setIsGameMinimized(false);
  }, []);

  const closeGameManually = useCallback(() => {
    setIsGameOpen(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsGameMinimized((prev) => !prev);
  }, []);

  const dismissResults = useCallback(() => {
    setIsResultsOpen(false);
  }, []);

  const recordFinishedGame = useCallback((score: GameScoreRecord) => {
    setLastScore(score);
    recordScore(score);
  }, []);

  const isPaused =
    (status === "WAITING_FOR_INPUT" && preferences.pauseOnInputRequired) || false;

  return {
    status,
    isGameOpen,
    isGameMinimized,
    isPaused,
    isResultsOpen,
    lastScore,
    delayRemainingSeconds,
    currentTaskElapsedSeconds,
    openGameManually,
    closeGameManually,
    toggleMinimize,
    dismissResults,
    processEvent,
    recordFinishedGame,
  };
}
