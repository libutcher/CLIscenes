/**
 * TerminalAdapter backed by asciinema-player (Apache-2.0).
 *
 * This is the only file that imports asciinema-player. To use a different
 * terminal renderer, implement TerminalAdapter (src/core/orchestrator.ts)
 * in a new file and swap it in Walkthrough.tsx.
 */
import * as AsciinemaPlayer from "asciinema-player";
import "asciinema-player/dist/bundle/asciinema-player.css";
import type { TerminalAdapter } from "../../core/orchestrator.ts";

export interface AsciinemaAdapterOptions {
  castUrl: string;
  cols: number;
  rows: number;
}

export function createAsciinemaAdapter(container: HTMLElement, options: AsciinemaAdapterOptions): TerminalAdapter {
  const player = AsciinemaPlayer.create({ url: options.castUrl }, container, {
    cols: options.cols,
    rows: options.rows,
    autoPlay: false,
    preload: true,
    // The orchestrator provides the controls. The player's own controls and
    // keyboard shortcuts could resume playback past a gate, so both are off.
    controls: false,
    pauseOnMarkers: true,
    fit: "width",
    terminalFontSize: "15px",
    theme: "asciinema",
  });

  // asciinema-player handles shortcuts (Space, arrows, [ and ]) through a
  // document-level listener. Stop plain key presses inside the terminal from
  // reaching it, but leave modified keys alone so Cmd/Ctrl+C still copies.
  const blockShortcuts = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Tab") return;
    event.stopPropagation();
  };
  container.addEventListener("keydown", blockShortcuts, true);

  return {
    play: async () => void (await player.play()),
    pause: async () => void (await player.pause()),
    seek: async (time) => void (await player.seek(time)),
    getCurrentTime: () => player.getCurrentTime(),
    onMarker: (handler) => player.addEventListener("marker", (event) => handler(event.label)),
    onEnded: (handler) => player.addEventListener("ended", () => handler()),
    onPlay: (handler) => player.addEventListener("play", () => handler()),
    dispose: () => {
      container.removeEventListener("keydown", blockShortcuts, true);
      player.dispose();
    },
  };
}
