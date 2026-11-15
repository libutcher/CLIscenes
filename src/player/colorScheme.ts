/**
 * Light or dark mode for the player.
 *
 * By default the player follows the reader's system setting. A host page,
 * such as a docs site with its own theme toggle, can choose instead:
 *
 *   - URL parameter:  ?theme=light | dark | auto
 *   - Live message:   iframe.contentWindow.postMessage({ type: "cliscenes:set-theme", theme: "dark" }, "*")
 *
 * The choice is stored as data-theme on <html>, which the CSS reads.
 */
import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "auto";

const isChoice = (value: unknown): value is ThemeChoice => value === "light" || value === "dark" || value === "auto";

export function setThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** Apply ?theme= and start listening for cliscenes:set-theme messages. */
export function initColorScheme(param: string | null): void {
  if (isChoice(param)) setThemeChoice(param);
  window.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown; theme?: unknown } | null;
    // Only the theme value is used, so messages from any origin are safe.
    if (data?.type === "cliscenes:set-theme" && isChoice(data.theme)) setThemeChoice(data.theme);
  });
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function current(): "light" | "dark" {
  const choice = document.documentElement.dataset.theme;
  if (choice === "light" || choice === "dark") return choice;
  return media().matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const query = media();
  query.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    query.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** The color scheme in effect, whether chosen by the host page or the system. Updates live. */
export function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, current, () => "light");
}
