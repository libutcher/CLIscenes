import { describe, expect, it } from "vitest";
import { parseCast, serializeCast } from "../src/core/asciicast.ts";
import { TIMING } from "../src/core/compile.ts";
import { stepIndexAt, commandForStep } from "../src/core/timeline.ts";
import { compileYaml, SIGNIN_YAML, stepById } from "./helpers.ts";

describe("asciicast v3 output", () => {
  const { cast } = compileYaml(SIGNIN_YAML);
  const parsed = parseCast(cast);

  it("writes a valid v3 header", () => {
    expect(parsed.header).toMatchObject({ version: 3, term: { cols: 80, rows: 16 }, title: "Sign in" });
  });

  it("uses relative intervals, not absolute timestamps", () => {
    const lines = cast.trim().split("\n").slice(1).map((l) => JSON.parse(l));
    // Typed characters are one typingSpeed apart, regardless of where they sit in the recording.
    const typed = lines.filter(([, code, data]) => code === "o" && data === "e");
    expect(typed[0][0]).toBe(0.05);
    expect(lines.every(([interval]) => interval >= 0)).toBe(true);
  });

  it("types commands one character per event and uses CRLF line endings", () => {
    const output = parsed.events.filter((e) => e.code === "o").map((e) => e.data);
    expect(output.slice(0, 3)).toEqual(["$ ", "d", "e"]);
    expect(output).toContain("ID   NAME\r\n");
    expect(output.every((d) => !/[^\r]\n/.test(d))).toBe(true);
  });

  it("is deterministic", () => {
    expect(compileYaml(SIGNIN_YAML).cast).toBe(cast);
  });
});

describe("reduced-motion recording", () => {
  const { cast, castReducedMotion, manifest } = compileYaml(SIGNIN_YAML);
  const full = parseCast(cast);
  const reduced = parseCast(castReducedMotion);

  it("is listed in the manifest", () => {
    expect(manifest.castReducedMotion).toBe("demo.reduced-motion.cast");
  });

  it("has the same duration and markers, so one manifest fits both", () => {
    expect(reduced.duration).toBeCloseTo(full.duration, 6);
    const markers = (events: typeof full.events) => events.filter((e) => e.code === "m").map((e) => [e.time.toFixed(3), e.data]);
    expect(markers(reduced.events)).toEqual(markers(full.events));
  });

  it("shows each command at once instead of typing it", () => {
    const output = reduced.events.filter((e) => e.code === "o").map((e) => e.data);
    expect(output).toContain("demo signin");
    expect(output).not.toContain("d");
    const at = (events: typeof full.events, data: string) => events.find((e) => e.data === data)!.time;
    // The whole command appears when the first character would have.
    expect(at(reduced.events, "demo signin")).toBeCloseTo(at(full.events, "d"), 6);
  });

  it("ends with the same screen content", () => {
    const text = (events: typeof full.events) => events.filter((e) => e.code === "o").map((e) => e.data).join("");
    expect(text(reduced.events)).toBe(text(full.events));
  });
});

describe("asciicast validation", () => {
  it("round-trips serialized events", () => {
    const cast = serializeCast({ version: 3, term: { cols: 10, rows: 2 } }, [
      { time: 0.5, code: "o", data: "a" },
      { time: 1.25, code: "m", data: "x" },
    ]);
    expect(parseCast(cast).events.map((e) => [e.time, e.code])).toEqual([
      [0.5, "o"],
      [1.25, "m"],
    ]);
  });

  it("rejects malformed files", () => {
    expect(() => parseCast('{"version":2,"width":80,"height":24}')).toThrow(/version must be 3/);
    expect(() => parseCast('{"version":3,"term":{"cols":0,"rows":24}}')).toThrow(/positive integers/);
    expect(() => parseCast('{"version":3,"term":{"cols":80,"rows":24}}\n[-1,"o","x"]')).toThrow(/Line 2/);
    expect(() => parseCast('{"version":3,"term":{"cols":80,"rows":24}}\n[1,"o"]')).toThrow(/Line 2/);
    expect(() => parseCast("# comment first")).toThrow(/Line 1/);
  });

  it("refuses to write out-of-order events", () => {
    expect(() =>
      serializeCast({ version: 3, term: { cols: 10, rows: 2 } }, [
        { time: 2, code: "o", data: "a" },
        { time: 1, code: "o", data: "b" },
      ]),
    ).toThrow(/time order/);
  });
});

describe("step-to-timeline mapping", () => {
  const { manifest, cast } = compileYaml(SIGNIN_YAML);
  const events = parseCast(cast).events;

  it("lays steps end to end from zero", () => {
    expect(manifest.steps[0]!.start).toBe(0);
    manifest.steps.forEach((step, i) => {
      expect(step.end).toBeGreaterThan(step.start);
      if (i > 0) expect(step.start).toBe(manifest.steps[i - 1]!.end);
    });
    expect(manifest.duration).toBe(manifest.steps.at(-1)!.end);
  });

  it("never places an event exactly on a step boundary", () => {
    for (const step of manifest.steps.slice(0, -1)) {
      expect(events.some((e) => Math.abs(e.time - step.end) < 0.01)).toBe(false);
    }
  });

  it("places each gate strictly inside its step, as a marker labelled with the step id", () => {
    const approve = stepById(manifest, "approve");
    expect(approve.gate!.time).toBeGreaterThan(approve.start);
    expect(approve.gate!.time).toBeLessThan(approve.end);
    const marker = events.find((e) => e.code === "m" && e.data === "approve")!;
    expect(marker.time).toBeCloseTo(approve.gate!.time, 3);
  });

  it("keeps all output for later steps after the gate", () => {
    const gate = stepById(manifest, "approve").gate!.time;
    const success = events.find((e) => e.data.includes("Signed in."))!;
    expect(success.time).toBeGreaterThan(gate);
  });

  it("ends the main path with a finish marker before the alternative path", () => {
    const list = stepById(manifest, "list");
    const denied = events.find((e) => e.data.includes("Request denied."))!;
    expect(list.finish!.time).toBeLessThan(list.end);
    expect(denied.time).toBeGreaterThan(list.finish!.time);
  });

  it("maps times to steps", () => {
    const approve = stepById(manifest, "approve");
    expect(stepIndexAt(manifest, 0)).toBe(0);
    expect(stepIndexAt(manifest, approve.start)).toBe(1);
    expect(stepIndexAt(manifest, approve.gate!.time)).toBe(1);
    expect(stepIndexAt(manifest, manifest.duration + 5)).toBe(manifest.steps.length - 1);
  });

  it("finds the command to copy for steps without their own command", () => {
    expect(commandForStep(manifest, 0)).toBe("demo signin");
    expect(commandForStep(manifest, 2)).toBe("demo signin");
    expect(commandForStep(manifest, 3)).toBe("demo list");
  });
});

describe("a branch that clears the screen", () => {
  /** The main path ends with output the branch must not inherit. */
  const YAML = `
title: Branch
steps:
  - id: ask
    title: Ask
    terminal:
      command: demo signin
    overlay:
      type: auth-prompt
      title: Allow sign-in?
      message: Approve to continue.
      actions:
        - label: Approve
        - label: Deny
          next: denied
    waitForAction: true
  - id: main
    title: Main path
    terminal:
      output: Signed in, and here is your list.
    finish: true
  - id: denied
    title: Denied
    terminal:
      clear: true
      output: Request denied.
`;
  const { manifest, cast } = compileYaml(YAML);
  const events = parseCast(cast).events;
  const clear = events.find((e) => e.data.includes("\u001b[2J"))!;
  const denied = stepById(manifest, "denied");

  it("clears before the branch begins, so jumping to it never shows the main path", () => {
    expect(events.find((e) => e.data.includes("here is your list"))!.time).toBeLessThan(clear.time);
    expect(clear.time).toBeLessThan(denied.start);
    // Seeking to the step's start replays everything up to it. Nothing is
    // drawn between the clear and the start, so the screen is blank on arrival.
    expect(events.filter((e) => e.code === "o" && e.time > clear.time && e.time <= denied.start)).toEqual([]);
  });

  it("gives the clear's time to the previous step, so the steps stay end to end", () => {
    expect(manifest.steps[0]!.start).toBe(0);
    manifest.steps.forEach((step, i) => {
      expect(step.end).toBeGreaterThan(step.start);
      if (i > 0) expect(step.start).toBe(manifest.steps[i - 1]!.end);
    });
  });
});

describe("a static image, with no Figma and no clicks", () => {
  /**
   * The other way to use an image: no `actions`, so there is nothing to place
   * from a design and nothing for the reader to click. The step shows the
   * image for its `pause` and moves on. demos/ no longer carries an example of
   * this, so the behaviour is pinned here.
   */
  const { manifest } = compileYaml(`
title: Screenshot
steps:
  - id: before
    title: Check the setting
    terminal:
      command: demo status
      output: "CLI integration: off"
  - id: setting
    title: Turn it on
    overlay:
      type: image
      src: settings.svg
      caption: YourApp > Settings > Developer
      alt: YourApp settings, with CLI integration turned on.
    pause: 2.5
  - id: after
    title: Check again
    terminal:
      output: "CLI integration: on"
    finish: true
`);

  it("never waits, so the walkthrough keeps one path from start to finish", () => {
    expect(manifest.steps.every((step) => step.gate === undefined)).toBe(true);
    const setting = stepById(manifest, "setting");
    expect(setting.overlays).toEqual([
      { type: "image", src: "settings.svg", caption: "YourApp > Settings > Developer", alt: "YourApp settings, with CLI integration turned on.", frame: true },
    ]);
    // `pause` is how long it stays on screen.
    expect(setting.end - setting.start).toBeCloseTo(TIMING.lead + 2.5, 3);
  });
});
