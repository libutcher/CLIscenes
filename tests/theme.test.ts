import { describe, expect, it } from "vitest";
import { contrast, darkModeAccent, MIN_TEXT_CONTRAST, readableTextOn, themeVariables } from "../src/core/theme.ts";
import { demoSchema, formatIssues } from "../src/core/schema.ts";

const step = { id: "a", title: "A", terminal: { output: "x" } };
const problems = (theme: unknown) => {
  const result = demoSchema.safeParse({ title: "T", theme, steps: [step] });
  return result.success ? [] : formatIssues(result.error);
};

describe("theme colors", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("always picks readable text for any accent", () => {
    for (const accent of ["#0f7b6c", "#ffcc00", "#808080", "#e11d48", "#1e3a8a", "#a3e635", "#000", "#fff"]) {
      expect(contrast(readableTextOn(accent), accent)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it("lightens dark accents for dark mode", () => {
    const navy = "#0b1f4d";
    const dark = darkModeAccent(navy);
    expect(dark).not.toBe(navy);
    expect(contrast(dark, "#1b1f27")).toBeGreaterThanOrEqual(3);
    expect(darkModeAccent("#6f9bff")).toBe("#6f9bff");
  });

  it("produces no variables without a theme", () => {
    expect(themeVariables(undefined, "light")).toEqual({});
  });

  it("derives a full set of variables from an accent", () => {
    const light = themeVariables({ accent: "#0f7b6c" }, "light");
    expect(light["--cs-accent"]).toBe("#0f7b6c");
    expect(light["--cs-accent-text"]).toBe("#ffffff");
    expect(Object.keys(light)).toEqual(
      expect.arrayContaining(["--cs-accent-soft", "--cs-focus", "--cs-app-deep", "--cs-desktop-a", "--cs-desktop-b"]),
    );
  });

  it("uses dark overrides in dark mode only", () => {
    const theme = { accent: "#0f7b6c", dark: { accent: "#5eead4" } };
    expect(themeVariables(theme, "light")["--cs-accent"]).toBe("#0f7b6c");
    expect(themeVariables(theme, "dark")["--cs-accent"]).toBe("#5eead4");
    expect(themeVariables(theme, "dark")["--cs-accent-text"]).toBe("#0b1220");
  });

  it("sets the desktop backdrop", () => {
    expect(themeVariables({ backdrop: "#f3efe6" }, "light")["--cs-desktop-base"]).toBe("#f3efe6");
  });
});

describe("theme validation", () => {
  it("accepts valid themes", () => {
    expect(problems({ accent: "#0f7b6c" })).toEqual([]);
    expect(problems({ accent: "#fc0", accentText: "#000", dark: { accent: "#5eead4" }, backdrop: "#eee" })).toEqual([]);
  });

  it("rejects colors that aren't hex", () => {
    expect(problems({ accent: "teal" })[0]).toMatch(/^theme\.accent: Use a hex color/);
  });

  it("rejects unreadable text on the accent, in either mode", () => {
    expect(problems({ accent: "#ffcc00", accentText: "#ffffff" })[0]).toMatch(/^theme\.accentText: .*contrast of 1\.\d+:1/);
    expect(problems({ accent: "#0f7b6c", dark: { accentText: "#5eead4" } })[0]).toMatch(/^theme\.dark\.accentText:/);
  });

  it("rejects unknown theme keys", () => {
    expect(problems({ primary: "#000000" })[0]).toMatch(/Unrecognized key/);
  });
});
