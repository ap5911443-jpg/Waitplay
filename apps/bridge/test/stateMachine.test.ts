import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { AgentStateMachine } from "@waitplay/shared";

describe("Agent State Machine", () => {
  test("initializes in IDLE state", () => {
    const sm = new AgentStateMachine("test-session");
    assert.equal(sm.getStatus(), "IDLE");
    assert.equal(sm.getSession().sessionId, "test-session");
    sm.destroy();
  });

  test("task_started transitions to WORKING and starts launch delay", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let launchRequested = false;
      const sm = new AgentStateMachine("delay-session", {
        startDelayMs: 4000,
        autoLaunch: true,
      });

      sm.subscribe({
        onGameLaunchRequested: () => {
          launchRequested = true;
        },
      });

      sm.handleEvent("task_started");
      assert.equal(sm.getStatus(), "WORKING");
      assert.equal(launchRequested, false, "Game should not launch immediately");

      // Advance mock timer deterministically
      mock.timers.tick(4001);

      assert.equal(sm.getStatus(), "GAME_ACTIVE");
      assert.equal(launchRequested, true, "Game should launch after delay");
      sm.destroy();
    } finally {
      mock.timers.reset();
    }
  });

  test("completion before launch delay cancels game launch", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let launchRequested = false;
      let stopRequested = false;

      const sm = new AgentStateMachine("quick-task-session", {
        startDelayMs: 4000,
        autoLaunch: true,
      });

      sm.subscribe({
        onGameLaunchRequested: () => {
          launchRequested = true;
        },
        onGameStopRequested: () => {
          stopRequested = true;
        },
      });

      sm.handleEvent("task_started");
      assert.equal(sm.getStatus(), "WORKING");

      // Advance 1500ms (before 4000ms launch delay)
      mock.timers.tick(1500);
      sm.handleEvent("task_completed");

      assert.equal(sm.getStatus(), "COMPLETED");

      // Advance past the remaining launch delay
      mock.timers.tick(5000);

      // Game should NEVER have launched!
      assert.equal(launchRequested, false, "Game should not launch if task completed early");
      assert.equal(stopRequested, false, "No game was running, so stop should not be requested");
      assert.equal(sm.getStatus(), "COMPLETED");
      sm.destroy();
    } finally {
      mock.timers.reset();
    }
  });

  test("waiting_for_input pauses game and resumes upon task_running", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let paused = false;
      let resumed = false;

      const sm = new AgentStateMachine("input-session", {
        startDelayMs: 1000,
        autoLaunch: true,
      });

      sm.subscribe({
        onGamePauseRequested: () => {
          paused = true;
        },
        onGameResumeRequested: () => {
          resumed = true;
        },
      });

      sm.handleEvent("task_started");
      mock.timers.tick(1001);
      assert.equal(sm.getStatus(), "GAME_ACTIVE");

      sm.handleEvent("waiting_for_input", Date.now(), { prompt: "Confirm tool run?" });
      assert.equal(sm.getStatus(), "WAITING_FOR_INPUT");
      assert.equal(paused, true);
      assert.equal(sm.getSession().waitingForInputPrompt, "Confirm tool run?");

      // Agent resumes working
      sm.handleEvent("task_running");
      assert.equal(sm.getStatus(), "GAME_ACTIVE");
      assert.equal(resumed, true);

      sm.destroy();
    } finally {
      mock.timers.reset();
    }
  });

  test("task_failed stops active game and records error", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let stopped = false;

      const sm = new AgentStateMachine("fail-session", {
        startDelayMs: 1000,
        autoLaunch: true,
      });

      sm.subscribe({
        onGameStopRequested: (_session, reason) => {
          if (reason === "failed") stopped = true;
        },
      });

      sm.handleEvent("task_started");
      mock.timers.tick(1001);
      assert.equal(sm.getStatus(), "GAME_ACTIVE");

      sm.handleEvent("task_failed", Date.now(), { error: "Network timeout" });
      assert.equal(sm.getStatus(), "FAILED");
      assert.equal(stopped, true);
      assert.equal(sm.getSession().lastError, "Network timeout");

      sm.destroy();
    } finally {
      mock.timers.reset();
    }
  });

  test("new task cancels previous completed state for multi-turn conversations", () => {
    const sm = new AgentStateMachine("multi-turn-session", {
      startDelayMs: 2000,
      autoLaunch: true,
    });

    // Turn 1
    sm.handleEvent("task_started");
    sm.handleEvent("task_completed");
    assert.equal(sm.getStatus(), "COMPLETED");
    assert.equal(sm.getSession().totalTasksCompleted, 1);

    // Turn 2 starts
    sm.handleEvent("task_started");
    assert.equal(sm.getStatus(), "WORKING");

    // Turn 2 completes
    sm.handleEvent("task_completed");
    assert.equal(sm.getStatus(), "COMPLETED");
    assert.equal(sm.getSession().totalTasksCompleted, 2);

    sm.destroy();
  });
});
