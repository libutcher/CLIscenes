---
name: cliscenes-authoring
description: Write or edit a CLIscenes walkthrough (a YAML file in demos/) that pairs terminal commands with UI outside the terminal, such as approval prompts, app settings, screenshots, and callouts. Use when someone asks to create, change, fix, or review a walkthrough, demo, or scene in this repository, or asks why one fails validation.
---

# Authoring CLIscenes walkthroughs

A walkthrough is one YAML file in `demos/`. The generator turns it into a terminal recording plus a manifest, and the player shows the terminal alongside UI outside it. Nothing in a source file is ever executed: every command and every line of output is text the author writes.

The complete format is in `docs/authoring.md`. Read it before writing anything. This skill covers the workflow and the decisions; that file covers the fields. If the two disagree, `docs/authoring.md` and `src/core/schema.ts` are correct.

## Workflow

1. **Understand the flow before writing YAML.** List the moments in order and where each one happens: the terminal, a desktop app prompt, app settings, or a browser. Note every point where the real CLI waits for the person to do something outside the terminal. Those become gates.
2. **Start from the closest example.**
   - `demos/cli-signin.yaml`: a command that triggers an approval prompt, with Approve and Deny branches. Uses the `overlay` layout.
   - `demos/cli-setup.yaml`: installing a CLI and turning on app settings the reader practices toggling. Uses the `split` layout.
3. **Create `demos/<id>.yaml`.** The file name is the walkthrough's id and appears in URLs: lowercase letters, numbers, and hyphens.
4. **Validate:** run `npm run validate`. It checks every file and prints errors with the file and field path, for example `steps[1].overlay.actions[0].next: Unknown step "sucess"`. Fix each error at that path and run it again until it passes.
   - On success, it prints one line per walkthrough, such as `valid  my-demo  (5 steps, 2 gated, 10.9s)`.
   - "Gated" counts the steps where playback stops for the reader. Check that it matches the number of `waitForAction: true` steps you intended.
5. **Preview:** run `npm run dev` and open the printed URL with `?demo=<id>`. The page regenerates and reloads on every save. Play it through once, and check:
   - each gate stops playback until you respond;
   - each branch starts from the screen you expect (see "Jumps and the terminal" below).

   If you can't run the dev server, ask the person to preview it, and tell them which branches to try.
6. **Before finishing,** run `npm test`. It also validates every walkthrough in `demos/`. If you changed code rather than only YAML, also run `npm run typecheck` and `npm run test:e2e`.

## Choosing pieces

**Overlay type** (UI outside the terminal):

| The person needs to… | Use | Can wait for them |
| --- | --- | --- |
| Approve or deny a request in a desktop app | `auth-prompt` | Yes, through `actions` |
| Turn on settings in an app | `settings-window` with `turnOn: true` on each setting to change | Yes, once every `turnOn` setting is on |
| See a simple app window with text and buttons | `app-window` | Yes, through `actions` |
| See a screenshot or illustration | `image` (local file, with required `alt` text) | No |
| Read a short explanation | `annotation` | No |

**Layout** (set once per walkthrough):

- `overlay`: UI floats over the terminal. Use it when the UI interrupts the terminal, as a prompt does.
- `split`: UI sits beside the terminal. Use it for apps the person looks at alongside the terminal, such as settings.
- If a walkthrough has both, choose the layout for the moment that matters most. Every overlay type works in either layout.

**Flow control:**

- `waitForAction: true` stops playback at the end of a step until the person responds. The step needs an overlay they can respond to (an action, or a `turnOn` setting). Otherwise validation fails, because they would be stuck.
- Each action's `next` jumps to another step. Without `next`, the walkthrough continues to the following step.
- For a branch such as "Deny", put the branch steps after the main path, and set `finish: true` on the last main-path step so playback doesn't run into them.
- `pause` sets how many seconds a step holds after its content. Timing is otherwise automatic; never calculate timestamps.
- A step with no `terminal` block leaves the terminal as it was, showing the earlier output.

**Jumps and the terminal.** A walkthrough is one continuous recording, and a jump moves to a later or earlier point in it. After a jump, the terminal shows everything recorded up to the target step, *not* what was on screen when the person clicked.

So a branch placed after the main path would show the main path's output above its own. Start every branch step that's reached by a jump with `clear: true`, then repeat whatever the reader needs to see. For example, in `cli-signin.yaml` the `denied` step clears the screen, then shows the command and the waiting message again before the error. Add `typing: false` to show a repeated command at once instead of typing it again.

Validation can't tell a missing `finish: true` from a deliberate skip ahead, so it won't catch a main path that plays into a branch. Preview every branch once, or ask the person to.

## Rules

- **No real secrets or personal data.** Use fictional accounts (`demo@example.com`) and placeholder IDs. Make secrets unmistakably fake, such as `EXAMPLE-not-a-real-password-0000`, never something that looks real.
- **Branding.** When documenting your own product, use its real name, icon (`icon:` on `auth-prompt`), and colors (`theme.accent`). Otherwise use the fictional `your-cli` and `YourApp`. Never copy another company's logo, colors, or exact interface. Describing the structure of a flow is fine.
- **Plausible output.** Write output the way the real tool would print it. When documenting a real CLI, copy its actual output, with secrets and personal details removed.
- **Accessibility.**
  - Every `image` needs `alt` text that says what the person should notice.
  - Action labels must make sense on their own, like "Approve" or "Deny" rather than "Click here".
  - Keep annotations to one or two sentences.
- **Readable terminals.** Use `terminal.cols` of about 64 for walkthroughs that will be read on phones or in narrow docs columns such as Mintlify. Use 80 for wide layouts.
- **Theme.** Set only `theme.accent` unless there's a reason to set more. The text color on the accent is chosen automatically. A hand-picked `accentText` that's hard to read fails validation.

## Common validation errors

| Error mentions | Fix |
| --- | --- |
| `Unknown step "…"` | A `next` value doesn't match any step `id`. Check the spelling. |
| `waitForAction needs an overlay the reader can answer` | Add `actions` to the overlay, or `turnOn: true` on a setting that starts with `toggle: false`. |
| `Use either overlay or overlays` | A step has both keys. Use `overlays:` (a list) for more than one. |
| `section must be one of the nav items` | In a `settings-window`, `section` must exactly match an entry in `nav`. |
| `A setting needs either toggle … or value` | Each setting has exactly one of `toggle: true/false` or `value: "…"`. |
| `Image not found` | Paths are relative to the YAML file. Put images in `demos/assets/`. |
| `Unrecognized key` | A misspelled field. Compare it against `docs/authoring.md`. |

## Embedding (when asked)

Embedding a finished walkthrough in a docs site is covered in `docs/embedding.md`. For Docusaurus and Mintlify, copy the ready-made embed from `examples/` and set its `src` to the hosted player URL with `?demo=<id>`.
