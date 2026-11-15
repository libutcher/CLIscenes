# Contributing

CLIscenes is an early personal project. Issues and pull requests are welcome.

## Report a problem or idea

Open an [issue](https://github.com/libutcher/CLIscenes/issues). For a bug, include the walkthrough YAML, what you expected, and what happened.

## Make a change

1. Install Node.js 20.19 or later.
2. Run `npm install`, then `npm run dev` to see the walkthroughs.
3. Make your change on a branch.
4. Run `npm run check`. It runs the type check, unit tests, and build.
5. If you changed the player, also run `npm run test:e2e`. The first run needs `npx playwright install chromium`.
6. Open a pull request that says what changed and why.

## Where things are

- [docs/authoring.md](docs/authoring.md) describes the walkthrough format.
- [docs/architecture.md](docs/architecture.md) explains the design, including how to add an overlay type.
- [AGENTS.md](AGENTS.md) has notes for AI coding assistants.

## Rules for walkthroughs

- Never include real secrets, tokens, or personal data.
- Use your own product's name, logo, and colors, never another company's.
- Give each image alt text.
