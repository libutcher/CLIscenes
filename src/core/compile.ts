/**
 * Compile a validated source into a timeline: an asciicast recording for the
 * terminal plus a manifest describing steps, gates, and overlays.
 *
 * Timing rules (all deterministic, no randomness):
 *  - No event is ever placed exactly on a step boundary, so seeking to a step's
 *    start never lands ambiguously "on" an event.
 *  - A gate is an asciicast marker ("m") placed after the step's content.
 *    asciinema-player pauses on markers (`pauseOnMarkers`), so terminal output
 *    belonging to later steps cannot be shown until the orchestrator resumes.
 *  - A `finish` step also ends with a marker; reaching it ends guided playback.
 *  - The gate sits strictly inside its step: [start, gate, end). While paused
 *    at a gate, the current time still maps to the gated step.
 */
import type { DemoSource, Overlay } from "./schema.ts";
import { serializeCast, type TimedEvent } from "./asciicast.ts";
import { MANIFEST_VERSION, type CompiledDemo, type CompiledStep } from "./types.ts";

/** Timing constants, in seconds. Kept together so pacing is easy to tune. */
export const TIMING = {
  /** Delay between a step starting and its first terminal event. */
  lead: 0.3,
  /** Delay between the prompt appearing and typing starting. */
  beforeTyping: 0.35,
  /** Delay after typing before "Enter". */
  beforeEnter: 0.35,
  /** Delay between "Enter" and the first output line. */
  beforeOutput: 0.45,
  /** Delay between output lines, so tables appear line by line. */
  betweenLines: 0.06,
  /** Hold after a step's content when the author sets no `pause`. */
  defaultPause: 1.2,
  /** Time an overlay is visible before playback stops at its gate. */
  beforeGate: 0.4,
  /** Gap after a gate before the next step begins. */
  afterGate: 0.3,
} as const;

const CLEAR_SCREEN = "\u001b[2J\u001b[3J\u001b[H";

export interface CompileResult {
  manifest: CompiledDemo;
  cast: string;
}

export interface CompileOptions {
  id: string;
  /** Rewrites overlay asset paths (for example image `src`) for the output folder. */
  rewriteAsset?: (src: string) => string;
}

/** Normalize authored output to terminal line endings, one entry per line. */
function outputLines(output: string): string[] {
  const trimmed = output.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return trimmed === "" ? [] : trimmed.split("\n");
}

export function compileDemo(source: DemoSource, options: CompileOptions): CompileResult {
  const { prompt, typingSpeed, cols, rows } = source.terminal;
  const events: TimedEvent[] = [];
  const steps: CompiledStep[] = [];
  const emit = (time: number, data: string, code: TimedEvent["code"] = "o") => events.push({ time, code, data });

  let t = 0;
  source.steps.forEach((step, index) => {
    const start = t;
    t += TIMING.lead;
    const term = step.terminal;

    if (term?.clear) {
      emit(t, CLEAR_SCREEN);
      t += 0.05;
    }

    if (term?.command) {
      emit(t, prompt);
      t += TIMING.beforeTyping;
      if (term.typing) {
        for (const char of term.command) {
          emit(t, char);
          t += typingSpeed;
        }
      } else {
        emit(t, term.command);
      }
      t += TIMING.beforeEnter;
      emit(t, "\r\n");
      t += TIMING.beforeOutput;
    }

    if (term?.output !== undefined) {
      for (const line of outputLines(term.output)) {
        emit(t, line + "\r\n");
        t += TIMING.betweenLines;
      }
    }

    let gate: CompiledStep["gate"];
    let finish: CompiledStep["finish"];
    if (step.finish) {
      t += step.pause ?? TIMING.defaultPause;
      finish = { time: round(t) };
      emit(t, step.id, "m");
      t += TIMING.afterGate;
    } else if (step.waitForAction) {
      t += TIMING.beforeGate;
      gate = { time: round(t) };
      // The marker label is the step id, so the orchestrator can identify it.
      emit(t, step.id, "m");
      t += TIMING.afterGate;
    } else {
      t += step.pause ?? TIMING.defaultPause;
    }

    const overlays = (step.overlays ?? (step.overlay ? [step.overlay] : [])).map((overlay) =>
      rewriteOverlay(overlay, options.rewriteAsset),
    );

    steps.push({
      id: step.id,
      title: step.title,
      index,
      start: round(start),
      end: round(t),
      ...(gate ? { gate } : {}),
      ...(finish ? { finish } : {}),
      ...(term?.command ? { command: term.command } : {}),
      ...(term?.output !== undefined ? { output: term.output } : {}),
      overlays,
    });
  });

  // Finish on an idle prompt. It also gives the recording its full duration.
  emit(t, prompt);

  const cast = serializeCast(
    { version: 3, term: { cols, rows, type: "xterm-256color" }, title: source.title },
    events,
  );

  return {
    cast,
    manifest: {
      manifestVersion: MANIFEST_VERSION,
      id: options.id,
      title: source.title,
      description: source.description,
      ...(source.prerequisites?.length ? { prerequisites: source.prerequisites } : {}),
      layout: source.layout,
      ...(source.theme ? { theme: source.theme } : {}),
      cast: "demo.cast",
      duration: round(t),
      terminal: { cols, rows },
      steps,
    },
  };
}

/** Point every local file an overlay references at its copy in the output folder. */
function rewriteOverlay(overlay: Overlay, rewriteAsset?: (src: string) => string): Overlay {
  if (!rewriteAsset) return overlay;
  if (overlay.type === "image") {
    return { ...overlay, src: rewriteAsset(overlay.src) };
  }
  if (overlay.type === "auth-prompt") {
    return {
      ...overlay,
      ...(overlay.icon ? { icon: rewriteAsset(overlay.icon) } : {}),
      ...(overlay.requesterIcon ? { requesterIcon: rewriteAsset(overlay.requesterIcon) } : {}),
    };
  }
  return overlay;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
