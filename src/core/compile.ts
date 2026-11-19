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
  /**
   * The same recording without the typing animation: each command appears
   * all at once. Every event time, marker, and step boundary is identical to
   * `cast`, so the manifest works with either.
   */
  castReducedMotion: string;
}

export interface CompileOptions {
  id: string;
  /**
   * Rewrites overlay asset paths (for example image `src`) for the output
   * folder. `animation` is a CSS file to add inside an SVG as it's copied.
   */
  rewriteAsset?: RewriteAsset;
}

/** Normalize authored output to terminal line endings, one entry per line. */
function outputLines(output: string): string[] {
  const trimmed = output.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return trimmed === "" ? [] : trimmed.split("\n");
}

export function compileDemo(source: DemoSource, options: CompileOptions): CompileResult {
  const { prompt, typingSpeed, cols, rows } = source.terminal;
  const events: TimedEvent[] = [];
  const reducedEvents: TimedEvent[] = [];
  const steps: CompiledStep[] = [];
  /** Add an event to both recordings. */
  const emit = (time: number, data: string, code: TimedEvent["code"] = "o") => {
    events.push({ time, code, data });
    reducedEvents.push({ time, code, data });
  };

  let t = 0;
  source.steps.forEach((step, index) => {
    const term = step.terminal;

    // `clear` wipes what earlier steps left on screen, so it belongs to the
    // gap before this step rather than inside it: the time goes to the
    // previous step, and this step starts on a blank screen. Jumping straight
    // here — a branch taken from an overlay action, or the step list — then
    // seeks past the clear, instead of landing on the earlier output and
    // showing it for a moment before the clear plays.
    const previous = steps[index - 1];
    if (term?.clear && previous) {
      emit(t, CLEAR_SCREEN);
      t += 0.05;
      previous.end = round(t);
    }

    const start = t;
    t += TIMING.lead;

    if (term?.command) {
      emit(t, prompt);
      t += TIMING.beforeTyping;
      if (term.typing) {
        // The reduced-motion recording shows the whole command at once, then
        // waits as long as typing would take, so both recordings stay in step.
        reducedEvents.push({ time: t, code: "o", data: term.command });
        for (const char of term.command) {
          events.push({ time: t, code: "o", data: char });
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

  const header = { version: 3, term: { cols, rows, type: "xterm-256color" }, title: source.title } as const;
  const cast = serializeCast(header, events);
  const castReducedMotion = serializeCast(header, reducedEvents);

  return {
    cast,
    castReducedMotion,
    manifest: {
      manifestVersion: MANIFEST_VERSION,
      id: options.id,
      title: source.title,
      description: source.description,
      ...(source.prerequisites?.length ? { prerequisites: source.prerequisites } : {}),
      ...(source.theme ? { theme: source.theme } : {}),
      cast: "demo.cast",
      castReducedMotion: "demo.reduced-motion.cast",
      duration: round(t),
      terminal: { cols, rows },
      steps,
    },
  };
}

export type RewriteAsset = (src: string, options?: { animation?: string; reducedMotion?: boolean }) => string;

/**
 * Point every local file an overlay references at its copy in the output
 * folder, and drop source-only fields that readers don't need.
 */
function rewriteOverlay(overlay: Overlay, rewriteAsset?: RewriteAsset): Overlay {
  if (overlay.type === "image") {
    // `animation` is built into the image, and `figma` may be an internal link.
    const { animation, figma: _figma, ...rest } = overlay;
    // Layer names are resolved into areas before compiling; don't publish them.
    const published = rest.actions ? { ...rest, actions: rest.actions.map(({ layer: _layer, ...action }) => action) } : rest;
    if (!rewriteAsset) return published;
    // An animated SVG gets a reduced-motion copy unless the author chose one.
    const srcReducedMotion = overlay.srcReducedMotion
      ? rewriteAsset(overlay.srcReducedMotion)
      : animation
        ? rewriteAsset(overlay.src, { animation, reducedMotion: true })
        : undefined;
    return {
      ...published,
      src: rewriteAsset(overlay.src, animation ? { animation } : undefined),
      ...(srcReducedMotion ? { srcReducedMotion } : {}),
    };
  }
  if (!rewriteAsset) return overlay;
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
