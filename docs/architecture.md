# Architecture

CLIscenes has three layers. Only the middle one is original. The other two are thin.

```
 demos/*.yaml ──► generator (Node) ──► generated/demos/<id>/demo.cast   ─┐
                                      generated/demos/<id>/demo.json    ├─► static player (browser)
                                      generated/demos/<id>/assets/*    ─┘
```

| Layer | What it does | Where |
| --- | --- | --- |
| **Terminal playback** | Renders commands and output as selectable text | asciinema-player, wrapped by `src/player/terminal/asciinemaAdapter.ts` |
| **Walkthrough orchestration** | Owns the timeline: which step is current, whether playback is waiting, which gates are answered | `src/core/orchestrator.ts` |
| **UI simulation** | Draws prompts, app windows, screenshots, and annotations from orchestrator state | `src/player/overlays/` |

## Folder layout

```
demos/                    Source files (YAML or JSON) and their images
src/core/                 Framework-free logic, also used by Node
  schema.ts               Authoring format and validation (zod)
  theme.ts                Brand colors → CSS variables, with contrast checks
  compile.ts              Source → timeline, asciicast, manifest
  asciicast.ts            asciicast v3 writer and validator
  timeline.ts             Time ↔ step helpers
  orchestrator.ts         State machine and TerminalAdapter interface
  types.ts                Compiled manifest types
src/node/                 Node-only code
  generate.ts             Reads demos/, writes generated/
  vite-plugin.ts          Regenerates on change during `npm run dev`
  licenses-plugin.ts      Writes dist/THIRD_PARTY_LICENSES.txt at build time
src/player/               Browser player (React)
  Walkthrough.tsx         Layout, controls, step list, announcements
  useWalkthrough.ts       Connects React to the orchestrator
  terminal/               Terminal adapter (the only asciinema import)
  overlays/               One component per overlay type, plus the registry
scripts/generate.ts       `npm run generate` / `npm run validate`
tests/                    Unit tests (Vitest)
e2e/                      Browser smoke tests (Playwright)
```

## Compilation

`compileDemo` walks the steps in order and produces events at absolute times, then converts them to asciicast v3 intervals. Timing constants live in `TIMING` in `src/core/compile.ts`.

For each step:

1. Wait `lead` seconds (so no event sits on the step boundary).
2. Optionally clear the screen.
3. Print the prompt, type the command one character at a time (or all at once), and press Enter.
4. Print output line by line.
5. Then one of:
   - **Gate** (`waitForAction`): wait `beforeGate`, emit a marker labelled with the step id, then wait `afterGate`.
   - **Finish** (`finish`): wait `pause`, emit a marker, then wait `afterGate`.
   - Otherwise wait `pause` (default 1.2 s).

Each compiled step records `start`, `end`, and optionally `gate.time` or `finish.time`. Markers always sit strictly inside their step, so while playback is stopped at a marker, the current time still maps to that step.

The output is deterministic: the same source always produces byte-identical files.

## Orchestration

The orchestrator is the single source of truth. The terminal is only a renderer it drives, and overlays have no timers of their own.

```
         play()                marker (gate pending)
  idle ─────────► playing ───────────────────────────► awaiting-action
                   ▲  │ pause()                              │
           play()  │  ▼                                      │ completeAction()
                  paused                                     ▼
                                                 goToStep(next) → playing
  playing ── finish marker or end of recording ──► ended ── play() → restart
```

- `sync()` reads the terminal clock and updates the current step. The React hook calls it once per animation frame while playing.
- `visibleOverlays(demo, state)` is a pure function. A step's overlays show while it is the current step, and a gated step's overlays close once its gate is completed.

### Gate policy

| Situation | Behavior |
| --- | --- |
| Playback reaches an unanswered gate | The player has already paused at the marker. Status becomes `awaiting-action`. Play does nothing until the reader acts. |
| Reader clicks an overlay action | The gate is marked `completed`, and playback jumps to the action's `next` step (default: the following step) and plays. |
| Reader answers before the gate is reached | The gate is marked `completed` and the overlay closes. If the answer leads to the following step, the rest of this step plays out normally; when the marker is reached, the orchestrator sees the gate is completed and continues. If it leads somewhere else (such as a Deny branch), playback jumps there right away. |
| Reader navigates to a step (Previous, Next, step list, Restart) | Playback starts from the beginning of that step. Every gate at or after the target is reset to `pending`, so a replayed gated step asks again. |
| Reader navigates forward past an unanswered gate | That gate is marked `skipped`, and the step list shows "Skipped". Skipping is deliberate, so it's allowed. |
| Something other than the orchestrator starts the player during a gate | The orchestrator pauses it and seeks back to the gate (safety net). |
| Playback reaches a `finish` step | Status becomes `ended`. Later steps (alternative paths) are reachable only by actions or navigation. Play restarts from the top. |

## Adding an overlay type

1. **Schema:** in `src/core/schema.ts`, add a `z.strictObject({ type: z.literal("my-type"), ... })` and add it to `overlaySchema`.
2. **Component:** create `src/player/overlays/MyType.tsx`. It receives `OverlayProps` (`overlay`, `waiting`, `baseUrl`, `onAction`). Use the shared `Actions` component for buttons.
3. **Register it:** add it to `overlayComponents` in `src/player/overlays/registry.tsx`. TypeScript reports an error until you do.
4. **Styles:** add `cs-`-prefixed styles to `src/player/styles.css`.
5. **Tests and docs:** add a case to `tests/schema.test.ts` and document the fields in `docs/authoring.md`.

If the overlay references files (like `image`, or the icons on `auth-prompt`), extend `rewriteOverlay` in `compile.ts`. The generator copies anything passed to `rewriteAsset`.

If readers can answer a gate with the new overlay, update `overlayCanAnswerGate` in `schema.ts`, and call `onAction` from the component when they do (see `SettingsWindow.tsx`).

## Replacing the terminal player

Implement `TerminalAdapter` (in `src/core/orchestrator.ts`) for the new player and use it in `useWalkthrough.ts`. The adapter must pause exactly at gate times and report them through `onMarker`. If the new player has no marker support, the adapter can implement this itself by watching `getCurrentTime()` against the manifest's gate times.

## Designed for later

These aren't built, but the design leaves room for them:

- **Generating sources automatically** (from CLI help text, tested docs examples, SDK comments, or test runs): anything that can write the YAML/JSON format, or call `compileDemo` with a `DemoSource` object, works. Validation is the same either way.
- **Real recorded output:** a future step could take output from a recording (for example, a VHS or asciinema capture) instead of authored text. The compiler would only need to accept timed output events for a step.
- **New overlay types:** see above.
