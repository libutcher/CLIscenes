# Prior art

CLIscenes sits next to several good tools for showing terminal sessions. This page compares them, so it's clear what CLIscenes reuses and what it adds.

Facts were checked against each project's repository, README, and package registry in November 2026. Star counts are approximate.

## Summary

| Project | Output | Authored from files | UI outside the terminal | That UI can gate playback | License |
| --- | --- | --- | --- | --- | --- |
| [asciinema-player](https://github.com/asciinema/asciinema-player) | Interactive text in the page | asciicast recordings (`.cast`) | No | Not applicable, but it provides the hooks: markers, `pauseOnMarkers`, `seek` | Apache-2.0 |
| [VHS](https://github.com/charmbracelet/vhs) | GIF, MP4, WebM, PNG frames | Yes, `.tape` DSL | No | No | MIT |
| [demorec](https://github.com/OpenHands/demorec) | Video (MP4, WebM) | Yes, `.demorec` DSL | Yes, a real browser driven by Playwright | No (linear video) | MIT |
| [terminal-demo](https://github.com/steelydylan/terminal-demo) | Interactive DOM animation | Yes, Markdown-like text or JSON | No | Not built in | MIT |
| [Terminal Simulator](https://github.com/IgorShadurin/terminal-simulator) | Live Next.js page | No (configured in TypeScript) | Yes, a mock browser window | No | None published |
| [Termynal](https://github.com/termynal/termynal.py) | Animated HTML in the page | Yes, Markdown code blocks (MkDocs) | No | No | MIT |
| [TermScene](https://github.com/r3al1tym/termscene) | Mainly video/GIF; HTML scrubber for previews | Yes, JSON/TS/JS scenes | Window chrome only | No | MIT |

None of these pairs selectable terminal text with mock UI outside the terminal that can stop playback until the reader responds. That pairing is the gap CLIscenes fills.

## Notes on each project

### asciinema-player

A web player for terminal recordings in the asciicast format. Terminal text is real DOM text, so readers can select and copy it. Its JavaScript API includes `play()`, `pause()`, `seek()` (to a time or a marker), `getCurrentTime()`, and `marker`, `play`, `pause`, and `ended` events. **Markers** in a recording can pause playback automatically (`pauseOnMarkers`).

**Reused by CLIscenes:** all terminal rendering and playback. CLIscenes generates asciicast v3 files for it. See [the ADR](adr/0001-terminal-player.md).

**Limits that matter:** it plays one recording linearly and doesn't know about anything outside the terminal. Its own controls and keyboard shortcuts can resume playback, so CLIscenes turns them off. Apache-2.0 requires keeping its license notice when the built player is redistributed. Actively maintained (v3.18.0, November 2026, about 2.9k stars).

### VHS (Charm)

"Terminal GIFs as code." A `.tape` script (`Type`, `Sleep`, `Wait`, `Screenshot`, and so on) drives a real shell and records it to GIF, MP4, or WebM. It can also write text output for golden-file tests.

**Relevance:** the clearest model for scripting terminal demos as code. It records real command execution, which CLIscenes deliberately doesn't do yet. Its output is video, so text can't be selected and nothing outside the terminal can be shown. A future CLIscenes importer could use VHS to capture real output. MIT. Needs ttyd and ffmpeg.

### demorec (OpenHands)

Records demos that switch between a terminal and a real browser (`@mode terminal`, `@mode browser`), with optional text-to-speech narration. It follows VHS's scripting style.

**Relevance:** the closest in spirit, because it tackles workflows that span several interfaces. Its output is linear video, so the reader can't interact with the demo, the terminal text can't be selected, and playback can't wait for a decision. Its README describes it as a sandbox project not yet supported for production use. MIT.

### terminal-demo

A zero-dependency animated terminal component (vanilla JS and React). Scenarios are written in a Markdown-like text format or JSON, including spinners, progress bars, and simulated selection menus. It can export a `.cast` file.

**Relevance:** a good model for an approachable authoring syntax. It can pause and resume, but has no built-in way to stop at a step until something outside the terminal happens, and no UI outside the terminal. Small, early project. MIT.

### Terminal Simulator

A Next.js page that shows a mock browser window with draggable macOS-style terminal windows streaming AI-agent activity. It's aimed at marketing screenshots.

**Relevance:** shows the visual appeal of putting terminal and app UI together. Configuration is code-only, playback is an endless animation, and the repository has **no license**, so nothing from it can be reused.

### Termynal

`termynal.py` is a Markdown extension for MkDocs that turns a fenced code block into an animated terminal. It's based on the original [ines/termynal](https://github.com/ines/termynal) JavaScript library, which hasn't been updated since 2018.

**Relevance:** proves that documentation teams value lightweight, text-based terminal animation that sits inside a docs pipeline. Readers still see the plain text if JavaScript is off. It shows the terminal only, with no gating. MIT.

### TermScene

Renders scripted mock terminal clips (`cmd`, `out`, `wait` steps on a virtual clock) to MP4, GIF, or WebM with headless Chrome. It has a `lint` command and ships an agent skill. A `scrub` command produces an HTML preview for tuning pacing.

**Relevance:** its deterministic, timecode-free scene format is close to CLIscenes' approach. Its output is video and it has no library API, so there's nothing to embed or orchestrate. MIT.

## What CLIscenes adds

- **A walkthrough orchestrator** that owns a single timeline for both the terminal and the UI outside it. Overlays are derived from that state, never driven by their own timers.
- **Gates:** playback stops at an exact point and can't continue until the reader responds. Then it continues, or branches to another step.
- **Mock UI outside the terminal** (authentication prompts, app windows, screenshots, annotations) that you add to by registering a component.
- **A docs-as-code source format** (YAML or JSON) with validation and readable errors. Authors never calculate timestamps or edit recordings.
- **Static, embeddable output:** a `.cast` file, a JSON manifest, and a small web player.

CLIscenes isn't the first tool to combine terminal and browser workflows. demorec does this for video. Its focus is interactive, accessible, maintainable documentation.
