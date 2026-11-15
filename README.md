# CLIscenes

Create interactive, embeddable walkthroughs of developer workflows that move between the terminal and other applications, from plain YAML files.

A CLIscenes walkthrough plays terminal commands and output as real, selectable text. It shows what happens outside the terminal (an authentication prompt, an app's settings window, a browser page) at the right moment. When a step needs the reader to do something, playback waits until they do.

> **Status:** working MVP. The format and APIs may still change.

## The problem

Many developer workflows don't stay in the terminal:

1. You run a CLI command.
2. A desktop app asks you to approve the request.
3. You approve it, and the CLI carries on.
4. Later, you change a setting in an app or paste something into a browser.

Documentation usually stitches this together from code blocks, screenshots, videos, and prose. These are hard to follow as one flow and hard to keep up to date. Terminal recordings help with the terminal part, but they can't show the dialog the reader has to click. A video can show everything, but the reader can't copy its text or interact with it, and a product change means re-recording it.

## What CLIscenes does

- **One timeline for the terminal and everything around it.** A small orchestrator owns playback, so a dialog can never be out of step with the terminal.
- **Gates.** Playback stops where the real CLI would wait. The reader clicks **Approve** (or **Deny**) to continue, and can branch to a different path.
- **Selectable, copyable text.** The terminal is text, not video, and a **Copy command** button copies the current command.
- **Docs as code.** Authors write steps, commands, output, and overlays in YAML or JSON. There are no timestamps to calculate and nothing to re-record. Validation errors name the exact field.
- **Static output.** Generation produces an asciicast v3 recording, a JSON manifest, and a small web player that you can host anywhere and embed with an iframe.

CLIscenes builds on existing tools instead of replacing them. Terminal rendering is [asciinema-player](https://github.com/asciinema/asciinema-player). See [docs/prior-art.md](docs/prior-art.md) for how CLIscenes relates to VHS, demorec, terminal-demo, Termynal, and others.

## Quick start

Requires Node.js 20.19 or later.

```sh
npm install
npm run dev
```

Open the URL that Vite prints (usually http://localhost:5173). The dev server generates the walkthroughs from `demos/` and regenerates them whenever you save a source file.

| Command | What it does |
| --- | --- |
| `npm run dev` | Generate demos, start the local player, and regenerate on change |
| `npm run generate` | Generate `generated/demos/` from `demos/` |
| `npm run validate` | Check every source file without writing anything |
| `npm run build` | Build the static site to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser smoke tests (first run: `npx playwright install chromium`) |
| `npm run typecheck` | TypeScript checks |
| `npm run check` | Type check, unit tests, and build |

## Example

`demos/cli-signin.yaml` (shortened). The `your-cli` CLI and its desktop app are fictional.

```yaml
title: Sign in to a CLI with a desktop app
layout: overlay            # the prompt pops up over the terminal

steps:
  - id: signin
    title: Run a command
    terminal:
      command: your-cli signin
      output: Waiting for approval in YourApp...

  - id: approve
    title: Approve the sign-in request
    overlay:
      type: auth-prompt
      app: YourApp
      title: Allow CLI sign-in?
      message: Terminal is running "your-cli signin" and wants to access your account.
      actions:
        - label: Approve
          next: success
        - label: Deny
          style: secondary
          next: denied
    waitForAction: true        # playback waits here for the reader

  - id: success
    title: Sign-in succeeds
    terminal:
      output: Signed in as demo@example.com

  - id: list-projects
    title: Run an authenticated command
    terminal:
      command: your-cli projects list
      output: |
        ID        NAME
        prj_001   Website
    finish: true               # end of the main path

  - id: denied
    title: If you deny the request
    terminal:
      clear: true
      output: "Error: sign-in request was denied in the desktop app."
```

To add a walkthrough, create a new `.yaml` file in `demos/`. The file name becomes its id (`?demo=<file-name>`).

The full format is in [docs/authoring.md](docs/authoring.md).

## Overlay types

| Type | Use it for | Can gate playback |
| --- | --- | --- |
| `auth-prompt` | A desktop app's approval window: requesting app, account, what approving allows, and a fingerprint or password cue | Yes |
| `app-window` | A mock app window with a title bar, text, read-only settings, and buttons | Yes |
| `settings-window` | A text-only wireframe of an app's settings, with left-hand nav and toggle switches readers turn on themselves | Yes |
| `image` | A local screenshot or illustration, with required alt text and an optional caption | No |
| `annotation` | A short callout explaining what's happening | No |

To add an overlay type, see [docs/architecture.md](docs/architecture.md#adding-an-overlay-type).

## Make it look like your product

You can customize each walkthrough from its source file. You don't need to change code.

- **Your app's icon** in authentication prompts: `icon: assets/your-app.svg`, plus `requesterIcon` for the program asking for access.
- **Your brand colors:** a `theme` block with an `accent` color, plus optional text color and dark-mode overrides. Text on the accent stays readable: CLIscenes picks the text color automatically, or rejects a combination with too little contrast.
- **All of the prompt's text:** the app name, title, message, account, the list of what approving allows, and the button labels.

```yaml
theme:
  accent: "#0f7b6c"
```

Use your own product's branding. To show how another app behaves, describe its structure and wording, not its logo or colors. See [docs/authoring.md](docs/authoring.md#theme).

## Playback and navigation

The controls are Restart, Previous step, Play/Pause, and Next step, plus a step list. The progress bar has one segment per step.

During normal playback, the reader never sees a step's result before completing the action it waits for. Readers can still move around freely:

- Going back to a step resets it and every later step. Replaying a gated step asks for the action again.
- Jumping forward past an unanswered gate is allowed, and the step list marks it "Skipped".

The full policy is in [docs/architecture.md](docs/architecture.md#gate-policy).

## Embedding

```sh
npm run build    # writes dist/
```

Host `dist/` on any static server, then embed:

```html
<iframe
  src="https://docs.example.com/cliscenes/?demo=cli-signin&embed=1"
  title="Interactive walkthrough: sign in to a CLI with a desktop app"
  loading="lazy"
  allow="clipboard-write"
  style="width: 100%; height: 560px; border: 0;"
></iframe>
```

`dist/embed-example.html` shows a working embed, including optional automatic iframe resizing. For notes on Mintlify and similar platforms, see [docs/embedding.md](docs/embedding.md).

## Accessibility

- Every control is a real button with an accessible name and a visible focus ring.
- Authentication prompts are labelled dialogs that don't block the page. The terminal stays visible and selectable.
- When a gated dialog appears and the reader is using the walkthrough, focus moves to its primary action. If the reader is elsewhere on the page, focus stays where it is and the page doesn't scroll.
- A live region announces each step change and what the walkthrough is waiting for.
- Images require alt text (`alt: ""` marks a decorative image).
- Animations are off when the reader prefers reduced motion. The player follows the system light or dark setting.
- The player's single-key shortcuts are turned off, so they can't conflict with the host page or assistive technology.

See [docs/manual-testing.md](docs/manual-testing.md) for the manual test checklist.

## Limitations

- All terminal output is authored text. CLIscenes never runs commands or records real sessions.
- One terminal per walkthrough, played as a single linear recording. Branches are later steps that you reach through `next`, and `finish` keeps the main path from playing into them.
- Overlays belong to one step. An overlay that stays across several steps has to be repeated.
- Command typing still animates when reduced motion is on.
- On narrow screens, wide terminals scale down. Keep `cols` near 64 for walkthroughs that will be read on phones.
- Images outside the source file's folder (`../logo.svg`) are copied under their file name only, so two such images with the same name collide. Keep images next to the source file, as in `demos/assets/`.
- Themes set colors only. Fonts and corner styles follow the player's design.
- There are no platform integrations yet. Embedding uses an iframe.

## Roadmap

- Import real output from asciinema or VHS recordings, so examples can be checked against the actual CLI.
- Generate walkthrough sources from CLI help text, tested docs examples, SDK comments, or test runs.
- Overlays that stay across a range of steps.
- Let the host page choose light or dark mode, to match a docs site's theme toggle.
- Native components for documentation frameworks (MDX, Docusaurus, Mintlify) as an alternative to iframes.
- More overlay types, such as a browser window with a URL bar and simple form fields.

## Project docs

- [docs/authoring.md](docs/authoring.md): source file reference
- [docs/architecture.md](docs/architecture.md): layers, timeline compilation, orchestrator, and gate policy
- [docs/adr/0001-terminal-player.md](docs/adr/0001-terminal-player.md): why asciinema-player
- [docs/prior-art.md](docs/prior-art.md): related projects
- [docs/embedding.md](docs/embedding.md): static output and embedding
- [docs/manual-testing.md](docs/manual-testing.md): browser test checklist

## License and attribution

CLIscenes is released under the [MIT License](LICENSE).

The built player bundles these packages:

| Package | License | Role |
| --- | --- | --- |
| [asciinema-player](https://github.com/asciinema/asciinema-player) | Apache-2.0 | Terminal playback |
| [solid-js](https://github.com/solidjs/solid) | MIT | Used internally by asciinema-player |
| [React](https://react.dev) and React DOM | MIT | Player UI |

These are used at build time only: [Vite](https://vite.dev) (MIT), [yaml](https://github.com/eemeli/yaml) (ISC), [zod](https://zod.dev) (MIT), [Vitest](https://vitest.dev) (MIT), [Playwright](https://playwright.dev) (Apache-2.0), [tsx](https://github.com/privatenumber/tsx) (MIT), and [TypeScript](https://www.typescriptlang.org) (Apache-2.0).

`npm run build` writes these packages' license texts to `dist/THIRD_PARTY_LICENSES.txt`. Keep that file when you redistribute a built player, because asciinema-player's Apache-2.0 license requires it.

The example walkthroughs use a fictional CLI and fictional apps. Any resemblance to a real product's interface is generic.
