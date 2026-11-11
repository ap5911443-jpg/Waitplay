import React, { useState, useRef } from "react";
import {
  Sparkles,
  Play,
  CheckCircle,
  XCircle,
  HelpCircle,
  FastForward,
  RotateCcw,
  Zap,
  Radio,
  Power,
} from "lucide-react";
import { AgentEvent, AgentEventPayload } from "@waitplay/shared";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

export interface SimulatorCardProps {
  onSimulateEvent: (event: AgentEvent, data?: Record<string, unknown>) => void;
  sendToBridge?: (event: AgentEventPayload) => Promise<boolean>;
  isBridgeConnected: boolean;
}

export const SimulatorCard: React.FC<SimulatorCardProps> = ({
  onSimulateEvent,
  sendToBridge,
  isBridgeConnected,
}) => {
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [routeThroughBridge, setRouteThroughBridge] = useState<boolean>(isBridgeConnected);
  const scenarioTimersRef = useRef<NodeJS.Timeout[]>([]);

  const stopActiveScenario = () => {
    scenarioTimersRef.current.forEach((t) => clearTimeout(t));
    scenarioTimersRef.current = [];
    setActiveScenario(null);
  };

  const dispatchEvent = (event: AgentEvent, data?: Record<string, unknown>) => {
    onSimulateEvent(event, data);

    if (routeThroughBridge && sendToBridge && isBridgeConnected) {
      const payload: AgentEventPayload = {
        agent: "claude-code",
        sessionId: "demo-simulator-session",
        event,
        timestamp: Date.now(),
        data,
      };
      void sendToBridge(payload);
    }
  };

  // Scenario 1: Standard Task (Game launches after delay, completes after 8s)
  const runStandardScenario = () => {
    stopActiveScenario();
    setActiveScenario("standard");

    dispatchEvent("task_started");

    const t1 = setTimeout(() => {
      dispatchEvent("task_running");
    }, 2000);

    const t2 = setTimeout(() => {
      dispatchEvent("task_completed");
      setActiveScenario(null);
    }, 8000);

    scenarioTimersRef.current = [t1, t2];
  };

  // Scenario 2: Quick Task (Completes in 2s, before launch delay)
  const runQuickScenario = () => {
    stopActiveScenario();
    setActiveScenario("quick");

    dispatchEvent("task_started");

    const t1 = setTimeout(() => {
      dispatchEvent("task_completed");
      setActiveScenario(null);
    }, 2000);

    scenarioTimersRef.current = [t1];
  };

  // Scenario 3: Permission Request (Working -> Needs Input -> Resumes -> Completes)
  const runPermissionScenario = () => {
    stopActiveScenario();
    setActiveScenario("permission");

    dispatchEvent("task_started");

    const t1 = setTimeout(() => {
      dispatchEvent("waiting_for_input", {
        prompt: "Execute bash command `npm test`?",
      });
    }, 5000);

    const t2 = setTimeout(() => {
      dispatchEvent("task_running");
    }, 9000);

    const t3 = setTimeout(() => {
      dispatchEvent("task_completed");
      setActiveScenario(null);
    }, 13000);

    scenarioTimersRef.current = [t1, t2, t3];
  };

  // Scenario 4: Task Failure
  const runFailureScenario = () => {
    stopActiveScenario();
    setActiveScenario("failure");

    dispatchEvent("task_started");

    const t1 = setTimeout(() => {
      dispatchEvent("task_failed", {
        error: "Process terminated with exit code 1 (Command failed)",
      });
      setActiveScenario(null);
    }, 5500);

    scenarioTimersRef.current = [t1];
  };

  return (
    <Card
      title="Agent Event Simulator"
      subtitle="Test the state machine, launch delays, and game transitions without Claude Code"
      icon={<Sparkles className="w-5 h-5 text-indigo-400" />}
      action={
        <div className="flex items-center space-x-2 text-xs">
          <label className="flex items-center space-x-1.5 cursor-pointer text-zinc-400">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span>Route via Bridge</span>
            <input
              type="checkbox"
              checked={routeThroughBridge}
              onChange={(e) => setRouteThroughBridge(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded bg-zinc-900 border-zinc-700"
            />
          </label>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Automated Scenario Presets */}
        <div>
          <div className="text-xs font-semibold text-zinc-300 mb-2 flex items-center justify-between">
            <span>Automated Testing Scenarios</span>
            {activeScenario && (
              <button
                onClick={stopActiveScenario}
                className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center space-x-1"
              >
                <Power className="w-3 h-3" />
                <span>Stop Scenario</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={runStandardScenario}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                activeScenario === "standard"
                  ? "bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500"
                  : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300"
              }`}
            >
              <div className="flex items-center space-x-1.5 font-medium text-xs">
                <FastForward className="w-3.5 h-3.5 text-blue-400" />
                <span>Standard (8s)</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                Game opens at 4s, results at 8s
              </div>
            </button>

            <button
              onClick={runQuickScenario}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                activeScenario === "quick"
                  ? "bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500"
                  : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300"
              }`}
            >
              <div className="flex items-center space-x-1.5 font-medium text-xs">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Quick (2s)</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                Completes before 4s, no game
              </div>
            </button>

            <button
              onClick={runPermissionScenario}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                activeScenario === "permission"
                  ? "bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500"
                  : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300"
              }`}
            >
              <div className="flex items-center space-x-1.5 font-medium text-xs">
                <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                <span>Permission</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                Pauses on input, then resumes
              </div>
            </button>

            <button
              onClick={runFailureScenario}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                activeScenario === "failure"
                  ? "bg-rose-600/20 border-rose-500 text-rose-300 ring-1 ring-rose-500"
                  : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300"
              }`}
            >
              <div className="flex items-center space-x-1.5 font-medium text-xs">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Failure</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                Encounter task error
              </div>
            </button>
          </div>
        </div>

        {/* Manual Step Event Triggers */}
        <div>
          <div className="text-xs font-semibold text-zinc-300 mb-2">
            Manual Event Controls
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-3 h-3 text-zinc-400" />}
              onClick={() => dispatchEvent("session_started")}
            >
              Session Start
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Play className="w-3 h-3 text-blue-400" />}
              onClick={() => dispatchEvent("task_started")}
            >
              Task Start
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Zap className="w-3 h-3 text-yellow-400" />}
              onClick={() => dispatchEvent("task_running")}
            >
              Task Running
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<HelpCircle className="w-3 h-3 text-amber-400" />}
              onClick={() =>
                dispatchEvent("waiting_for_input", {
                  prompt: "Allow Claude Code to edit src/index.ts?",
                })
              }
            >
              Waiting for Input
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCircle className="w-3 h-3 text-emerald-400" />}
              onClick={() => dispatchEvent("task_completed")}
            >
              Task Completed
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircle className="w-3 h-3 text-rose-400" />}
              onClick={() =>
                dispatchEvent("task_failed", {
                  error: "Compilation error: missing module reference",
                })
              }
            >
              Task Failed
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Power className="w-3 h-3 text-zinc-400" />}
              onClick={() => dispatchEvent("session_ended")}
            >
              Session End
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
