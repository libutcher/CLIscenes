/** Pure helpers for mapping playback time to steps. */
import type { CompiledDemo, CompiledStep } from "./types.ts";

/** Index of the step containing `time`. Times past the end map to the last step. */
export function stepIndexAt(demo: CompiledDemo, time: number): number {
  const { steps } = demo;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (time >= steps[i]!.start - 1e-6) return i;
  }
  return 0;
}

/** Progress (0–1) through a single step. */
export function stepProgress(step: CompiledStep, time: number): number {
  const length = step.end - step.start;
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (time - step.start) / length));
}

/** The command a reader most likely wants to copy: this step's, or the latest before it. */
export function commandForStep(demo: CompiledDemo, index: number): string | undefined {
  for (let i = index; i >= 0; i--) {
    const command = demo.steps[i]?.command;
    if (command) return command;
  }
  return undefined;
}
