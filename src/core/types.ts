/**
 * The compiled format: what the generator writes and the browser player reads.
 * Authors never edit this by hand.
 */
import type { Overlay } from "./schema.ts";
import type { Theme } from "./theme.ts";

export const MANIFEST_VERSION = 1;

export interface CompiledStep {
  id: string;
  title: string;
  index: number;
  /** Absolute playback time (seconds) where the step begins. */
  start: number;
  /** Absolute playback time where the next step begins. */
  end: number;
  /** Present when playback must stop for a reader action. `time` is inside [start, end). */
  gate?: { time: number };
  /** Present when guided playback ends after this step. `time` is inside [start, end). */
  finish?: { time: number };
  command?: string;
  output?: string;
  overlays: Overlay[];
}

export interface CompiledDemo {
  manifestVersion: typeof MANIFEST_VERSION;
  id: string;
  title: string;
  description: string;
  layout: "split" | "overlay";
  /** Brand colors, as authored. The player turns them into CSS variables. */
  theme?: Theme;
  /** Cast file, relative to the manifest. */
  cast: string;
  duration: number;
  terminal: { cols: number; rows: number };
  steps: CompiledStep[];
}

/** One entry in generated/demos/index.json. */
export interface DemoIndexEntry {
  id: string;
  title: string;
  description: string;
}
