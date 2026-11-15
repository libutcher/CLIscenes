/**
 * Per-walkthrough theming. Authors give a brand accent (and optionally a few
 * other colors). This module turns that into the player's CSS variables for
 * light and dark mode, keeping text on the accent readable.
 *
 * Contrast follows WCAG 2.x relative luminance.
 */

export interface ThemeColors {
  /** Buttons, highlights, and the default app icon. */
  accent?: string;
  /** Text on accent-colored buttons. Chosen automatically when omitted. */
  accentText?: string;
}

export interface Theme extends ThemeColors {
  /** Overrides for dark mode. Missing values are derived from the light ones. */
  dark?: ThemeColors;
}

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Minimum contrast for normal-size text (WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;

const WHITE = "#ffffff";
const NEAR_BLACK = "#0b1220";

/** Default surfaces the accent is blended with (match player.css). */
const SURFACE = { light: "#ffffff", dark: "#1b1f27" };

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  if (!HEX_COLOR.test(hex)) throw new Error(`Not a hex color: ${hex}`);
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Mix `a` into `b`: amount 1 is all `a`, 0 is all `b`. */
export function mix(a: string, b: string, amount: number): string {
  const [ra, ga, ba] = parseHex(a);
  const [rb, gb, bb] = parseHex(b);
  return toHex([rb + (ra - rb) * amount, gb + (ga - gb) * amount, bb + (ba - bb) * amount]);
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrast(WHITE, background) >= contrast(NEAR_BLACK, background) ? WHITE : NEAR_BLACK;
}

/**
 * Lighten an accent until it stands out on the dark surface (3:1, the WCAG
 * minimum for UI components), so a dark brand color still works in dark mode.
 */
export function darkModeAccent(accent: string): string {
  let color = accent;
  for (let i = 0; i < 10 && contrast(color, SURFACE.dark) < 3; i++) color = mix(WHITE, color, 0.2);
  return color;
}

/**
 * Darken an accent until it stands out on the light surface (3:1), so a pale
 * brand color (such as a light yellow) still gives a visible focus ring,
 * switch, and highlight.
 */
export function lightModeAccent(accent: string): string {
  let color = accent;
  for (let i = 0; i < 12 && contrast(color, SURFACE.light) < 3; i++) color = mix("#000000", color, 0.15);
  return color;
}

/**
 * The accent actually used in a color scheme: the author's color, adjusted
 * only as far as needed to stay visible on that scheme's surface.
 */
export function resolvedAccent(theme: Theme, scheme: "light" | "dark"): string | undefined {
  if (scheme === "light") return theme.accent ? lightModeAccent(theme.accent) : undefined;
  const base = theme.dark?.accent ?? theme.accent;
  return base ? darkModeAccent(base) : undefined;
}

export type CssVariables = Record<`--cs-${string}`, string>;

/** CSS variables for one color scheme. Empty when the theme sets nothing. */
export function themeVariables(theme: Theme | undefined, scheme: "light" | "dark"): CssVariables {
  if (!theme) return {};
  const override = scheme === "dark" ? theme.dark : undefined;
  const vars: CssVariables = {};

  const accent = resolvedAccent(theme, scheme);
  if (accent) {
    const surface = SURFACE[scheme];
    vars["--cs-accent"] = accent;
    vars["--cs-accent-text"] = override?.accentText ?? (scheme === "light" ? theme.accentText : undefined) ?? readableTextOn(accent);
    vars["--cs-accent-soft"] = mix(accent, surface, scheme === "light" ? 0.12 : 0.22);
    vars["--cs-focus"] = accent;
  }
  return vars;
}
