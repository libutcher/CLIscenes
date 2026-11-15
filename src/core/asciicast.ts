/**
 * Minimal asciicast v3 writer and validator.
 * Spec: https://docs.asciinema.org/manual/asciicast/v3/
 *
 * In v3, each event's first field is the interval since the previous event,
 * not an absolute timestamp. We build events with absolute times (easier to
 * reason about) and convert at the last moment.
 */

export type EventCode = "o" | "i" | "m" | "r" | "x";

/** An event positioned at an absolute time in seconds. */
export interface TimedEvent {
  time: number;
  code: EventCode;
  data: string;
}

export interface CastHeader {
  version: 3;
  term: { cols: number; rows: number; type?: string };
  title?: string;
  [key: string]: unknown;
}

/** Times are stored with millisecond precision to keep files stable and diffable. */
const round = (n: number) => Math.round(n * 1000) / 1000;

export function serializeCast(header: CastHeader, events: TimedEvent[]): string {
  const lines = [JSON.stringify(header)];
  let previous = 0;
  for (const event of events) {
    const time = round(event.time);
    if (time < previous) {
      throw new Error(`Cast events must be in time order (got ${time} after ${previous}).`);
    }
    lines.push(JSON.stringify([round(time - previous), event.code, event.data]));
    previous = time;
  }
  return lines.join("\n") + "\n";
}

export interface ParsedCast {
  header: CastHeader;
  /** Events with absolute times reconstructed from the intervals. */
  events: TimedEvent[];
  duration: number;
}

/**
 * Parse and validate an asciicast v3 file. Throws with a line number on the
 * first problem. Used by tests and by the generator as a self-check.
 */
export function parseCast(source: string): ParsedCast {
  const lines = source.split("\n");
  const first = lines[0];
  if (!first || first.startsWith("#")) throw new Error("Line 1: the header must be the first line.");

  let header: CastHeader;
  try {
    header = JSON.parse(first);
  } catch {
    throw new Error("Line 1: header is not valid JSON.");
  }
  if (header.version !== 3) throw new Error("Line 1: header.version must be 3.");
  const { cols, rows } = header.term ?? {};
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
    throw new Error("Line 1: header.term.cols and header.term.rows must be positive integers.");
  }

  const events: TimedEvent[] = [];
  let time = 0;
  lines.slice(1).forEach((line, i) => {
    const lineNo = i + 2;
    if (line === "" || line.startsWith("#")) return;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`Line ${lineNo}: event is not valid JSON.`);
    }
    if (!Array.isArray(event) || event.length !== 3) {
      throw new Error(`Line ${lineNo}: event must be a [interval, code, data] array.`);
    }
    const [interval, code, data] = event;
    if (typeof interval !== "number" || !Number.isFinite(interval) || interval < 0) {
      throw new Error(`Line ${lineNo}: interval must be a non-negative number.`);
    }
    if (typeof code !== "string" || typeof data !== "string") {
      throw new Error(`Line ${lineNo}: code and data must be strings.`);
    }
    if (code === "r" && !/^\d+x\d+$/.test(data)) {
      throw new Error(`Line ${lineNo}: resize data must look like "COLSxROWS".`);
    }
    time += interval;
    events.push({ time, code: code as EventCode, data });
  });

  return { header, events, duration: time };
}
