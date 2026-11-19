---
name: cliscenes-authoring
description: Write or edit a CLIscenes walkthrough (a YAML file in demos/) of a CLI sign-in or approval flow, pairing terminal commands with the desktop app prompt the CLI waits on, plus screenshots and callouts. Use when someone asks to create, change, fix, or review a walkthrough, demo, or scene in this repository, or asks why one fails validation.
---

# Authoring CLIscenes walkthroughs

A walkthrough is one YAML file in `demos/`. The generator turns it into a terminal recording plus a manifest, and the player shows the terminal alongside UI outside it. Nothing in a source file is ever executed: every command and every line of output is text the author writes.

The complete format is in `docs/authoring.md`. Read it before writing anything. This skill covers the workflow and the decisions; that file covers the fields. If the two disagree, `docs/authoring.md` and `src/core/schema.ts` are correct.

## Workflow

1. **Understand the flow before writing YAML.** List the moments in order and where each one happens: the terminal, a desktop app prompt, app settings, or a browser. Note every point where the real CLI waits for the person to do something outside the terminal. Those become gates.
2. **Start from the example.** `demos/figma-touch-id.yaml`: a command that triggers an approval prompt shown as an image, with Approve and Cancel branches. Uses the `overlay` layout. It is the only walkthrough in `demos/`, so it is also what the tests and the docs refer to.
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
| See a simple app window with text and buttons | `app-window` | Yes, through `actions` |
| See a screenshot or illustration | `image` (local file, with required `alt` text). With no `actions` it just shows for `pause` seconds, needs no layer names, positions file or Figma link, and works with any image | No |
| See an app's real prompt, such as Touch ID | `image` with `frame: false`. Add `actions` for buttons the person clicks, each with an `area` (a measured percentage) or a `layer` (a name looked up in the image's `.layers.json`, see `demos/figma-touch-id.yaml`). Or give the step a `pause` to close it by itself. Optional `animation` (CSS) and `figma` link | Yes, through `actions` |
| Read a short explanation | `annotation` | No |

**Flow control:**

- `waitForAction: true` stops playback at the end of a step until the person clicks an action. The step needs an overlay with `actions`. Otherwise validation fails, because they would be stuck.
- Each action's `next` jumps to another step. Without `next`, the walkthrough continues to the following step.
- For a branch such as "Deny", put the branch steps after the main path, and set `finish: true` on the last main-path step so playback doesn't run into them.
- `pause` sets how many seconds a step holds after its content. Timing is otherwise automatic; never calculate timestamps.
- A step with no `terminal` block leaves the terminal as it was, showing the earlier output.

**Jumps and the terminal.** A walkthrough is one continuous recording, and a jump moves to a later or earlier point in it. After a jump, the terminal shows everything recorded up to the target step, *not* what was on screen when the person clicked.

So a branch placed after the main path would show the main path's output above its own. Start every branch step that's reached by a jump with `clear: true`, then repeat whatever the reader needs to see. For example, in `figma-touch-id.yaml` the `cancelled` step clears the screen, then shows the command and the waiting message again before the error. Add `typing: false` to show a repeated command at once instead of typing it again.

The clear is placed just before the step begins, so a jump lands on an already-blank screen rather than flashing the main path's output first. That only works if the branch step has `clear: true`; without it, the earlier output stays.

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
| `waitForAction needs an overlay with at least one action` | Add `actions` to the overlay, such as Approve and Deny. |
| `Use either overlay or overlays` | A step has both keys. Use `overlays:` (a list) for more than one. |
| `Image not found` | Paths are relative to the YAML file. Put images in `demos/assets/`. |
| `can't use ".."`, `outside the walkthrough's folder`, or `Not an image file` | Images must be image files inside the walkthrough's folder. Copy the image into `demos/assets/` and point to it there. |
| `Copy link to selection` | The `figma` value isn't a link to one frame. In Figma, select the frame and choose Copy link to selection. |
| `No click-area positions` or `No layer named` | An action uses `layer`, but the image's `.layers.json` is missing or doesn't list that layer. If the image has a `figma` link, ask the person to run `npm run figma`. If it doesn't, the file is written by hand: check the name against it (names are case-sensitive). |
| `Set FIGMA_TOKEN` | `npm run figma` needs a Figma personal access token. Ask the person to set it. Never ask them to paste it into chat or a file. Without Figma access, `layer` still works: leave `figma` out and write the `.layers.json` by hand (`docs/authoring.md`). |
| `Unrecognized key` | A misspelled field. Compare it against `docs/authoring.md`. |

## Embedding (when asked)

Embedding a finished walkthrough in a docs site is covered in `docs/embedding.md`. For Docusaurus and Mintlify, copy the ready-made embed from `examples/` and set its `src` to the hosted player URL with `?demo=<id>`.
