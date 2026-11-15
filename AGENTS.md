# Notes for AI coding agents

CLIscenes turns YAML files in `demos/` into interactive walkthroughs that pair terminal playback with UI outside the terminal.

## Writing or editing walkthroughs

Follow [`.claude/skills/cliscenes-authoring/SKILL.md`](.claude/skills/cliscenes-authoring/SKILL.md). It's plain Markdown, so any agent (or person) can use it. Claude Code also loads it automatically as a skill. The full source format is in [`docs/authoring.md`](docs/authoring.md).

## Changing code

- Architecture and design decisions: [`docs/architecture.md`](docs/architecture.md).
- Before finishing, run `npm run typecheck`, `npm test`, and `npm run build`. Also run `npm run test:e2e` when player behavior changes. The first run needs `npx playwright install chromium`.
- Commands in walkthrough files are never executed. Keep it that way.
