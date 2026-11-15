import { parse } from "yaml";
import { compileDemo } from "../src/core/compile.ts";
import { parseCast } from "../src/core/asciicast.ts";
import { demoSchema } from "../src/core/schema.ts";
import type { TerminalAdapter } from "../src/core/orchestrator.ts";
import type { CompiledDemo } from "../src/core/types.ts";

/** A small sign-in walkthrough used across tests. */
export const SIGNIN_YAML = `
title: Sign in
steps:
  - id: signin
    title: Run a command
    terminal:
      command: demo signin
      output: Waiting for approval...
  - id: approve
    title: Approve
    overlay:
      type: auth-prompt
      title: Allow sign-in?
      message: Approve to continue.
      actions:
        - label: Approve
        - label: Deny
          style: secondary
          next: denied
    waitForAction: true
  - id: success
    title: Success
    terminal:
      output: Signed in.
  - id: list
    title: List things
    terminal:
      command: demo list
      output: |
        ID   NAME
        1    First
    finish: true
  - id: denied
    title: Denied
    terminal:
      output: Request denied.
`;

export function compileYaml(yaml: string, id = "test") {
  return compileDemo(demoSchema.parse(parse(yaml)), { id });
}

/**
 * A fake terminal that behaves like asciinema-player with pauseOnMarkers:
 * playback stops exactly at a marker and fires the marker event. It also
 * records which output has been "shown" so tests can check for leaks.
 */
export class FakeTerminal implements TerminalAdapter {
  time = 0;
  playing = false;
  private readonly events;
  private readonly duration: number;
  private markerHandlers: ((label: string) => void)[] = [];
  private endedHandlers: (() => void)[] = [];
  private playHandlers: (() => void)[] = [];

  constructor(cast: string) {
    const parsed = parseCast(cast);
    this.events = parsed.events;
    this.duration = parsed.duration;
  }

  async play() {
    this.playing = true;
    this.playHandlers.forEach((h) => h());
  }
  async pause() {
    this.playing = false;
  }
  async seek(time: number) {
    this.time = time;
  }
  getCurrentTime() {
    return this.time;
  }
  onMarker(handler: (label: string) => void) {
    this.markerHandlers.push(handler);
  }
  onEnded(handler: () => void) {
    this.endedHandlers.push(handler);
  }
  onPlay(handler: () => void) {
    this.playHandlers.push(handler);
  }
  dispose() {}

  /** Simulate wall-clock time passing. */
  advance(seconds: number) {
    if (!this.playing) return;
    const target = this.time + seconds;
    // Strict ">" so that resuming from a marker doesn't hit it again.
    const marker = this.events.find((e) => e.code === "m" && e.time > this.time && e.time <= target);
    if (marker) {
      this.time = marker.time;
      this.playing = false;
      this.markerHandlers.forEach((h) => h(marker.data));
      return;
    }
    if (target >= this.duration) {
      this.time = this.duration;
      this.playing = false;
      this.endedHandlers.forEach((h) => h());
      return;
    }
    this.time = target;
  }

  /** Terminal output visible at the current time (ignores clear sequences). */
  screen(): string {
    return this.events
      .filter((e) => e.code === "o" && e.time <= this.time + 1e-9)
      .map((e) => e.data)
      .join("");
  }

  /** Simulate something other than the orchestrator starting playback. */
  externalPlay() {
    void this.play();
  }
}

export function stepById(demo: CompiledDemo, id: string) {
  const step = demo.steps.find((s) => s.id === id);
  if (!step) throw new Error(`No step ${id}`);
  return step;
}

/** Let pending promise callbacks run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
