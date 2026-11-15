import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { demoSchema, formatIssues } from "../src/core/schema.ts";
import { parseDemoSource, DemoSourceError } from "../src/node/generate.ts";
import { SIGNIN_YAML } from "./helpers.ts";

const minimal = (steps: unknown[]) => ({ title: "T", steps });

function problems(input: unknown): string[] {
  const result = demoSchema.safeParse(input);
  return result.success ? [] : formatIssues(result.error);
}

describe("source schema", () => {
  it("accepts a valid walkthrough and fills defaults", () => {
    const demo = demoSchema.parse(parse(SIGNIN_YAML));
    expect(demo.terminal).toEqual({ cols: 80, rows: 16, prompt: "$ ", typingSpeed: 0.05 });
    expect(demo.steps[0]!.terminal?.typing).toBe(true);
    expect(demo.steps[1]!.overlay).toMatchObject({ type: "auth-prompt", app: "Desktop app" });
  });

  it("accepts every overlay type", () => {
    const steps = [
      { id: "a", title: "A", overlay: { type: "auth-prompt", title: "T", message: "M", actions: [{ label: "OK" }] } },
      { id: "b", title: "B", overlay: { type: "app-window", title: "App", body: "Hello", fields: [{ label: "x", value: "y" }] } },
      { id: "c", title: "C", overlay: { type: "image", src: "assets/x.png", alt: "Alt" } },
      { id: "d", title: "D", overlays: [{ type: "annotation", text: "Note" }] },
    ];
    expect(problems(minimal(steps))).toEqual([]);
  });

  it("accepts the optional auth-prompt details and defaults verification to none", () => {
    const prompt = {
      type: "auth-prompt",
      requester: "Terminal",
      title: "Allow?",
      message: "M",
      account: { name: "Demo Account", email: "demo@example.com" },
      details: ["Run commands as you"],
      verification: "biometric",
      actions: [{ label: "Approve" }],
    };
    expect(problems(minimal([{ id: "a", title: "A", overlay: prompt }]))).toEqual([]);
    const plain = demoSchema.parse(minimal([{ id: "a", title: "A", overlay: { ...prompt, verification: undefined } }]));
    expect(plain.steps[0]!.overlay).toMatchObject({ verification: "none" });
    expect(problems(minimal([{ id: "a", title: "A", overlay: { ...prompt, verification: "face" } }]))[0]).toMatch(
      /verification/,
    );
  });

  it("accepts prerequisites", () => {
    const demo = demoSchema.parse({ ...minimal([{ id: "a", title: "A", terminal: { output: "x" } }]), prerequisites: ["An app"] });
    expect(demo.prerequisites).toEqual(["An app"]);
  });

  it("rejects an action pointing at an unknown step", () => {
    const steps = [
      { id: "a", title: "A", overlay: { type: "auth-prompt", title: "T", message: "M", actions: [{ label: "OK", next: "nope" }] } },
    ];
    expect(problems(minimal(steps))).toEqual([
      'steps[0].overlay.actions[0].next: Unknown step "nope". Known steps: a.',
    ]);
  });

  it("rejects duplicate step ids", () => {
    const steps = [
      { id: "a", title: "A", terminal: { output: "x" } },
      { id: "a", title: "B", terminal: { output: "y" } },
    ];
    expect(problems(minimal(steps))).toEqual(['steps[1].id: Duplicate step id "a".']);
  });

  it("rejects waitForAction without any action to click", () => {
    const steps = [{ id: "a", title: "A", overlay: { type: "annotation", text: "Hi" }, waitForAction: true }];
    expect(problems(minimal(steps))[0]).toMatch(/^steps\[0\]\.waitForAction: .*stuck/);
  });

  it("rejects empty steps, mixed overlay keys, and conflicting stops", () => {
    expect(problems(minimal([{ id: "a", title: "A" }]))[0]).toMatch(/needs a terminal block, an overlay, or both/);
    const both = { type: "annotation", text: "x" };
    expect(problems(minimal([{ id: "a", title: "A", overlay: both, overlays: [both] }]))[0]).toMatch(/not both/);
    const gatedFinish = {
      id: "a",
      title: "A",
      overlay: { type: "auth-prompt", title: "T", message: "M", actions: [{ label: "OK" }] },
      waitForAction: true,
      finish: true,
    };
    expect(problems(minimal([gatedFinish]))[0]).toMatch(/waitForAction or finish/);
  });

  it("rejects unknown keys, unknown overlay types, bad ids, and remote images", () => {
    expect(problems(minimal([{ id: "a", title: "A", terminal: { output: "x" }, typo: 1 }]))[0]).toMatch(/Unrecognized key/);
    expect(problems(minimal([{ id: "a", title: "A", overlay: { type: "video" } }]))[0]).toMatch(/^steps\[0\]\.overlay/);
    expect(problems(minimal([{ id: "Bad Id", title: "A", terminal: { output: "x" } }]))[0]).toMatch(/lowercase/);
    const remote = { type: "image", src: "https://example.com/x.png", alt: "x" };
    expect(problems(minimal([{ id: "a", title: "A", overlay: remote }]))[0]).toMatch(/relative path/);
  });

  it("rejects a terminal block with nothing in it", () => {
    expect(problems(minimal([{ id: "a", title: "A", terminal: {} }]))[0]).toMatch(/needs a command, output, or clear/);
  });

  it("reports YAML syntax errors with the file name", () => {
    expect(() => parseDemoSource("title: [unclosed", "demos/broken.yaml")).toThrow(DemoSourceError);
    expect(() => parseDemoSource("title: [unclosed", "demos/broken.yaml")).toThrow(/demos\/broken\.yaml/);
  });

  it("accepts JSON sources", () => {
    const json = JSON.stringify(minimal([{ id: "a", title: "A", terminal: { command: "ls" } }]));
    expect(parseDemoSource(json, "demo.json").steps).toHaveLength(1);
  });
});
