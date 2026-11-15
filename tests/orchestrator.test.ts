import { beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, visibleOverlays } from "../src/core/orchestrator.ts";
import type { CompiledDemo } from "../src/core/types.ts";
import { compileYaml, FakeTerminal, flush, SIGNIN_YAML, stepById } from "./helpers.ts";

let demo: CompiledDemo;
let terminal: FakeTerminal;
let orchestrator: Orchestrator;

/** Advance playback in small ticks, syncing like the UI does each frame. */
function run(seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) {
    terminal.advance(0.05);
    orchestrator.sync();
  }
}

const state = () => orchestrator.getState();
const overlayTypes = () => visibleOverlays(demo, state()).map((o) => o.type);

beforeEach(() => {
  const compiled = compileYaml(SIGNIN_YAML);
  demo = compiled.manifest;
  terminal = new FakeTerminal(compiled.cast);
  orchestrator = new Orchestrator(demo, terminal);
});

describe("guided playback", () => {
  it("starts idle with no overlays", () => {
    expect(state().status).toBe("idle");
    expect(overlayTypes()).toEqual([]);
  });

  it("stops at the gate and never shows later output before the action", async () => {
    await orchestrator.play();
    run(30);
    expect(state()).toMatchObject({ status: "awaiting-action", stepIndex: 1 });
    expect(terminal.playing).toBe(false);
    expect(terminal.screen()).toContain("Waiting for approval...");
    expect(terminal.screen()).not.toContain("Signed in.");
    expect(overlayTypes()).toEqual(["auth-prompt"]);
  });

  it("ignores Play while waiting for an action", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.play();
    run(5);
    expect(state().status).toBe("awaiting-action");
    expect(terminal.screen()).not.toContain("Signed in.");
  });

  it("re-pauses if something else starts the player during a gate", async () => {
    await orchestrator.play();
    run(30);
    terminal.externalPlay();
    await flush();
    expect(terminal.playing).toBe(false);
    expect(terminal.time).toBe(stepById(demo, "approve").gate!.time);
  });

  it("continues after the action, closes the overlay, and shows the result", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.completeAction("approve");
    expect(state().gates.approve).toBe("completed");
    expect(state().stepIndex).toBe(2);
    expect(overlayTypes()).toEqual([]);
    run(2);
    expect(terminal.screen()).toContain("Signed in.");
  });

  it("follows an action's next target", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.completeAction("approve", "denied");
    run(5);
    expect(state().stepIndex).toBe(stepById(demo, "denied").index);
    expect(terminal.screen()).toContain("Request denied.");
  });

  it("stops at a finish step instead of playing into the alternative path", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.completeAction("approve");
    run(30);
    expect(state()).toMatchObject({ status: "ended", stepIndex: stepById(demo, "list").index });
    expect(terminal.screen()).not.toContain("Request denied.");
  });

  it("restarts from the beginning when Play is pressed after the end", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.completeAction("approve");
    run(30);
    await orchestrator.play();
    expect(state()).toMatchObject({ status: "playing", stepIndex: 0, gates: { approve: "pending" } });
    expect(terminal.time).toBe(0);
  });

  it("continues without stopping if the action was clicked before the gate was reached", async () => {
    await orchestrator.play();
    // Run until the approve step starts, but stop before its gate.
    const approve = stepById(demo, "approve");
    while (terminal.time < approve.start) {
      terminal.advance(0.05);
      orchestrator.sync();
    }
    expect(state().status).toBe("playing");
    expect(overlayTypes()).toEqual(["auth-prompt"]);
    await orchestrator.completeAction("approve");
    run(3);
    expect(state().status).toBe("playing");
    expect(terminal.screen()).toContain("Signed in.");
  });
});

describe("pause and resume", () => {
  it("pauses mid-step and resumes from the same point", async () => {
    await orchestrator.play();
    run(0.6);
    await orchestrator.pause();
    const pausedAt = terminal.time;
    expect(state().status).toBe("paused");
    run(5);
    expect(terminal.time).toBe(pausedAt);
    await orchestrator.togglePlay();
    expect(state().status).toBe("playing");
    run(0.5);
    expect(terminal.time).toBeGreaterThan(pausedAt);
  });

  it("keeps overlays visible while paused", async () => {
    await orchestrator.play();
    const approve = stepById(demo, "approve");
    while (terminal.time < approve.start) {
      terminal.advance(0.05);
      orchestrator.sync();
    }
    await orchestrator.pause();
    expect(overlayTypes()).toEqual(["auth-prompt"]);
  });
});

describe("navigation and gates", () => {
  it("replays a gated step: going back resets the gate and shows the overlay again", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.completeAction("approve");
    run(1);
    expect(overlayTypes()).toEqual([]);

    await orchestrator.previous();
    expect(state()).toMatchObject({ stepIndex: 1, gates: { approve: "pending" } });
    expect(overlayTypes()).toEqual(["auth-prompt"]);
    run(30);
    expect(state().status).toBe("awaiting-action");
    expect(terminal.screen()).not.toContain("Signed in.");
  });

  it("seeking backward to an earlier step also resets later gates", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.completeAction("approve");
    await orchestrator.goToStep(0);
    expect(state().gates.approve).toBe("pending");
    expect(terminal.time).toBe(0);
  });

  it("skipping forward past an unanswered gate marks it skipped", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.next();
    expect(state()).toMatchObject({ status: "playing", stepIndex: 2, gates: { approve: "skipped" } });
    expect(overlayTypes()).toEqual([]);
  });

  it("jumping forward from idle skips the gate without waiting", async () => {
    await orchestrator.goToStep(3);
    expect(state().gates.approve).toBe("skipped");
    run(2);
    expect(state().status).toBe("playing");
  });

  it("Next does nothing on the last step; Previous on the first replays it", async () => {
    await orchestrator.goToStep(demo.steps.length - 1);
    await orchestrator.next();
    expect(state().stepIndex).toBe(demo.steps.length - 1);
    await orchestrator.goToStep(0);
    run(0.5);
    await orchestrator.previous();
    expect(state().stepIndex).toBe(0);
    expect(terminal.time).toBe(0);
  });

  it("restart resets every gate", async () => {
    await orchestrator.play();
    run(30);
    await orchestrator.next();
    await orchestrator.restart();
    expect(state()).toMatchObject({ status: "playing", stepIndex: 0, gates: { approve: "pending" } });
  });

  it("overlays belong to the current step only", async () => {
    await orchestrator.goToStep(4);
    expect(overlayTypes()).toEqual([]);
    await orchestrator.goToStep(1);
    expect(overlayTypes()).toEqual(["auth-prompt"]);
  });
});
