# ADR 0001: Use asciinema-player for terminal playback

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

CLIscenes needs a terminal renderer that:

1. stays in sync with UI outside the terminal, and can be stopped exactly at a point;
2. can be controlled programmatically (play, pause, seek, events);
3. shows text that readers can select and copy;
4. can be generated from declarative source files;
5. is easy to embed in a static page;
6. is maintained;
7. has a license compatible with an MIT project.

Candidates: asciinema-player, terminal-demo, Termynal, and building our own. VHS, demorec, and TermScene output video, so they fail requirement 3. See [prior-art.md](../prior-art.md).

## Decision

Use **asciinema-player 3.x** with generated **asciicast v3** recordings, behind a small `TerminalAdapter` interface (`src/core/orchestrator.ts`).

Gates are compiled into asciicast **marker** events (`"m"`), and the player runs with `pauseOnMarkers: true`.

## Why

- **Synchronization:** reading the player source (3.18.0) showed that output is fed to the terminal in batches of consecutive `"o"` events, and a batch stops at a marker. When a marker is reached with `pauseOnMarkers`, the player pauses at the marker's time, then fires the `marker` event. So output written after a gate can't appear before the orchestrator resumes playback. This is the guarantee the product depends on.
- **Control:** `play()`, `pause()`, `seek(seconds)`, `getCurrentTime()`, and `marker`, `play`, and `ended` events cover what the orchestrator needs.
- **Text selection:** terminal text is rendered in a `<pre>` element. The canvas only draws backgrounds.
- **Authoring:** asciicast v3 is a simple, documented JSON-lines format that is easy to generate deterministically.
- **Maintenance and license:** actively maintained, Apache-2.0.

terminal-demo was the main alternative. It has a friendly authoring format, but nothing built in to stop at an exact step, and it is a much younger project.

## Constraints we had to handle

- **The player's own controls and keyboard shortcuts** (Space, arrows, `[` and `]`) could resume playback past a gate. The adapter sets `controls: false`, hides the start overlay, and stops plain key presses inside the terminal from reaching the player's document-level shortcut handler. Cmd/Ctrl+C still copies.
- **Markers alone aren't enough.** They tell us when playback stopped, not whether the reader has responded, and they don't model skipping or replaying. A small orchestrator state machine owns that logic. As a safety net, if anything starts the player while a gate is waiting, the orchestrator pauses it and seeks back.
- **No events on step boundaries.** The compiler never places an event exactly where a step starts, so seeking to a step is never ambiguous.
- **Linear recordings.** One `.cast` file per walkthrough. Branches (such as "Deny") are separate steps later in the same recording, and `finish: true` stops the main path before them.

## Consequences

- Replacing the terminal player means writing one new adapter file. The orchestrator, overlays, and authoring format don't change.
- We depend on `pauseOnMarkers` pausing exactly at the marker. The browser smoke test (`e2e/`) checks this, so a regression in a player upgrade would be caught.
- The built player bundles asciinema-player (and its dependency solid-js, MIT). The build writes their license texts to `dist/THIRD_PARTY_LICENSES.txt`, and redistributing `dist/` must keep that file.
