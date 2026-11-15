/**
 * The walkthrough orchestrator: the single source of truth for where a
 * walkthrough is and what the reader may see.
 *
 * The terminal player is just a renderer driven by this class. Overlays never
 * run their own timers; they are derived from `state` (see `visibleOverlays`).
 *
 * Gate policy (also in docs/architecture.md):
 *  - During playback, a gated step stops at its gate until the reader clicks
 *    one of its overlay actions. Later output cannot appear before then.
 *  - Clicking an action completes the gate and continues at the action's
 *    `next` step (default: the following step).
 *  - Navigating to a step (Previous, Next, step list, Restart) resets every
 *    gate at or after that step, so replaying a gated step asks again.
 *  - A `finish` step ends guided playback; Play then restarts from the top.
 *  - Navigating forward past an unanswered gate marks it "skipped". Skipping is
 *    deliberate navigation, so it is allowed, and the step list shows it.
 */
import type { Overlay } from "./schema.ts";
import type { CompiledDemo } from "./types.ts";
import { stepIndexAt } from "./timeline.ts";

/** What the orchestrator needs from a terminal player. Times are in seconds. */
export interface TerminalAdapter {
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(time: number): Promise<void>;
  getCurrentTime(): number;
  /** Called when playback reaches a gate marker (and has paused there). */
  onMarker(handler: (label: string) => void): void;
  /** Called when playback reaches the end of the recording. */
  onEnded(handler: () => void): void;
  /** Called whenever the player starts playing, whoever asked it to. */
  onPlay(handler: () => void): void;
  dispose(): void;
}

export type Status = "idle" | "playing" | "paused" | "awaiting-action" | "ended";
export type GateState = "pending" | "completed" | "skipped";

export interface OrchestratorState {
  status: Status;
  stepIndex: number;
  time: number;
  /** Keyed by step id. Only gated steps appear here. */
  gates: Record<string, GateState>;
  /**
   * Increases on every navigation (Restart, Previous, Next, step list,
   * actions). The UI uses it to reset overlays, even when the step index is
   * unchanged, for example restarting from step 1.
   */
  visit: number;
}

type Listener = (state: OrchestratorState) => void;

export class Orchestrator {
  private state: OrchestratorState;
  private listeners = new Set<Listener>();
  /** Increments on each navigation so stale async work can bail out. */
  private navigation = 0;
  private navigating = false;

  constructor(
    readonly demo: CompiledDemo,
    private readonly terminal: TerminalAdapter,
  ) {
    this.state = { status: "idle", stepIndex: 0, time: 0, gates: this.freshGates(), visit: 0 };
    terminal.onMarker((label) => this.handleMarker(label));
    terminal.onEnded(() => this.handleEnded());
    terminal.onPlay(() => this.handlePlay());
  }

  getState = (): OrchestratorState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // --- Reader commands ------------------------------------------------------

  async play(): Promise<void> {
    const { status } = this.state;
    if (status === "awaiting-action" || status === "playing") return;
    if (status === "ended") return this.restart();
    this.set({ status: "playing" });
    await this.terminal.play();
  }

  async pause(): Promise<void> {
    if (this.state.status !== "playing") return;
    this.set({ status: "paused" });
    await this.terminal.pause();
    this.sync();
  }

  togglePlay(): Promise<void> {
    return this.state.status === "playing" ? this.pause() : this.play();
  }

  restart(): Promise<void> {
    return this.goToStep(0);
  }

  next(): Promise<void> {
    const target = this.state.stepIndex + 1;
    if (target >= this.demo.steps.length) return Promise.resolve();
    return this.goToStep(target);
  }

  previous(): Promise<void> {
    return this.goToStep(Math.max(0, this.state.stepIndex - 1));
  }

  /**
   * Reader clicked an overlay action. Completes the step's gate (if any) and
   * continues at the action's target.
   */
  async completeAction(stepId: string, next?: string): Promise<void> {
    const index = this.demo.steps.findIndex((s) => s.id === stepId);
    if (index === -1) return;
    const target = next ? this.demo.steps.findIndex((s) => s.id === next) : index + 1;

    const step = this.demo.steps[index]!;
    if (stepId in this.state.gates) {
      this.set({ gates: { ...this.state.gates, [stepId]: "completed" } });
    }
    if (target === -1) return;

    // Answered before playback reached the gate, and continuing to the
    // following step: let the rest of this step play instead of skipping it.
    // When the marker is reached, the completed gate lets playback through.
    const beforeGate =
      step.gate !== undefined &&
      (this.state.status === "playing" || this.state.status === "paused") &&
      this.terminal.getCurrentTime() < step.gate.time;
    if (beforeGate && target === index + 1) return;

    if (target >= this.demo.steps.length) {
      // Action on the final step: play out whatever remains.
      this.set({ status: "playing" });
      await this.terminal.play();
      return;
    }
    await this.goToStep(target);
  }

  /** Jump to the start of a step and play from there (guided playback). */
  async goToStep(index: number): Promise<void> {
    const step = this.demo.steps[index];
    if (!step) return;
    const token = ++this.navigation;
    this.navigating = true;

    const gates: Record<string, GateState> = {};
    for (const s of this.demo.steps) {
      if (!s.gate) continue;
      const current = this.state.gates[s.id] ?? "pending";
      if (s.index >= index) gates[s.id] = "pending";
      else gates[s.id] = current === "pending" ? "skipped" : current;
    }
    this.set({ status: "playing", stepIndex: index, time: step.start, gates, visit: this.state.visit + 1 });

    try {
      await this.terminal.pause();
      await this.terminal.seek(step.start);
      if (token !== this.navigation) return;
      await this.terminal.play();
    } finally {
      if (token === this.navigation) this.navigating = false;
    }
  }

  /**
   * Read the terminal's clock and update the current step. The UI calls this
   * on each animation frame while playing; tests call it directly.
   */
  sync(): void {
    if (this.navigating) return;
    const time = this.terminal.getCurrentTime();
    // While waiting at a gate, the step is pinned to the gated step.
    if (this.state.status === "awaiting-action") {
      this.set({ time });
      return;
    }
    this.set({ time, stepIndex: stepIndexAt(this.demo, time) });
  }

  dispose(): void {
    this.listeners.clear();
    this.terminal.dispose();
  }

  // --- Terminal events --------------------------------------------------------

  private handleMarker(label: string): void {
    const step = this.demo.steps.find((s) => s.id === label);
    if (step?.finish) {
      // End of the main path. The player has paused at the marker.
      this.set({ status: "ended", stepIndex: step.index, time: step.finish.time });
      return;
    }
    if (!step?.gate) return;
    if (this.state.gates[step.id] === "pending") {
      // The player has already paused itself at the marker. Stay here.
      this.set({ status: "awaiting-action", stepIndex: step.index, time: step.gate.time });
    } else {
      // Already answered (for example, the reader clicked early): keep going.
      void this.terminal.play();
    }
  }

  private handleEnded(): void {
    this.set({ status: "ended", stepIndex: this.demo.steps.length - 1, time: this.demo.duration });
  }

  /** Safety net: nothing may start playback while a gate is waiting. */
  private handlePlay(): void {
    if (this.state.status === "awaiting-action") {
      const gate = this.demo.steps[this.state.stepIndex]?.gate;
      void this.terminal.pause().then(() => (gate ? this.terminal.seek(gate.time) : undefined));
    }
  }

  // --- Internals ---------------------------------------------------------------

  private freshGates(): Record<string, GateState> {
    const gates: Record<string, GateState> = {};
    for (const step of this.demo.steps) if (step.gate) gates[step.id] = "pending";
    return gates;
  }

  private set(patch: Partial<OrchestratorState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(patch) as (keyof OrchestratorState)[]).some((key) => next[key] !== this.state[key]);
    if (!changed) return;
    this.state = next;
    for (const listener of this.listeners) listener(this.state);
  }
}

/**
 * Overlays the reader should currently see. Overlays belong to their step and
 * are shown while that step is current, except that a gated step's overlays
 * close once its gate is completed.
 */
export function visibleOverlays(demo: CompiledDemo, state: OrchestratorState): Overlay[] {
  if (state.status === "idle") return [];
  const step = demo.steps[state.stepIndex];
  if (!step) return [];
  if (step.gate && state.gates[step.id] === "completed") return [];
  return step.overlays;
}
