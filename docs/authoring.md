# Authoring reference

A walkthrough is one YAML (`.yaml`, `.yml`) or JSON file in `demos/`. The file name becomes the demo id, which is used in URLs. Use lowercase letters, numbers, and hyphens, for example `cli-signin.yaml`.

Nothing in a source file is ever executed. All output is text you write.

## Top level

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `title` | Yes | | Shown above the walkthrough. |
| `description` | No | `""` | One or two sentences under the title. |
| `layout` | No | `split` | `split`: UI outside the terminal appears beside it (stacked on small screens). `overlay`: it floats over the lower right of the terminal. |
| `terminal.cols` | No | `80` | Terminal width in characters. |
| `terminal.rows` | No | `16` | Terminal height in lines. |
| `terminal.prompt` | No | `"$ "` | Text printed before each command. |
| `terminal.typingSpeed` | No | `0.05` | Seconds per typed character. |
| `steps` | Yes | | One or more steps, played in order. |

## Steps

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `id` | Yes | | Unique. Lowercase letters, numbers, and hyphens. Used by `next`. |
| `title` | Yes | | Shown in the controls and the step list. |
| `terminal` | One of `terminal` or an overlay | | What happens in the terminal. |
| `overlay` | | | One UI element outside the terminal. |
| `overlays` | | | A list of UI elements outside the terminal. Use either `overlay` or `overlays`. |
| `waitForAction` | No | `false` | Stop at the end of this step until the reader clicks an action. Needs an overlay with `actions`. |
| `finish` | No | `false` | End guided playback after this step. Later steps are reachable only through an action's `next` or navigation. Use it to end the main path before an alternative path. |
| `pause` | No | `1.2` | Seconds to hold after the step's content. |

### `terminal`

| Field | Default | Description |
| --- | --- | --- |
| `command` | | Printed after the prompt. |
| `output` | | Printed after the command, line by line. Use a `|` block for several lines. |
| `typing` | `true` | Type the command one character at a time. `false` prints it at once. |
| `clear` | `false` | Clear the terminal before this step. |

A terminal block needs at least one of `command`, `output`, or `clear: true`.

## Overlay types

### `auth-prompt`

A desktop authentication request, drawn as an app window. In split layout it sits on a soft desktop backdrop. Only `title`, `message`, and `actions` are required. The other fields add detail so the prompt looks like what the real app shows.

```yaml
overlay:
  type: auth-prompt
  app: Example Desktop       # optional, default "Desktop app"; shown in the title bar
  requester: Terminal        # optional; shown as an icon beside the app
  title: Allow CLI sign-in?
  message: Terminal is running "example signin" and wants to access your account.
  account:                   # optional
    name: Demo Account
    email: demo@example.com  # optional
  details:                   # optional; what approving allows
    - Run commands as you from this terminal
    - Access ends after 30 minutes of inactivity
  verification: biometric    # optional: none (default), biometric, or password
  actions:
    - label: Approve          # goes to the following step
    - label: Deny
      style: secondary        # primary (default) or secondary
      next: denied            # step id to go to
```

Buttons are laid out the way desktop dialogs usually are: secondary actions on the left, the primary action on the right. `verification: biometric` shows a fingerprint cue, and `password` shows a filled-in, read-only password field. Neither asks the reader for anything real.

The prompt is a generic design. When you model it on a real product's prompt, copy its structure and wording, not its logo or brand colors.

### `app-window`

A simple mock application window with a title bar.

```yaml
overlay:
  type: app-window
  title: Example App — Settings   # title bar text
  heading: Developer               # optional
  body: |                          # optional; blank lines separate paragraphs
    Turn on the integration to continue.
  fields:                          # optional read-only settings
    - label: Integration
      value: "On"
  actions:                         # optional
    - label: Done
  annotations:                     # optional notes inside the window
    - Select Done to return to the walkthrough.
```

### `image`

A local screenshot or illustration. `src` is relative to the source file and is copied into the output.

```yaml
overlay:
  type: image
  src: assets/browser-form.svg
  alt: A browser window showing the Add key form.   # required; describe what matters
  caption: Paste the key into the form.             # optional
```

Write `alt` text that describes what the reader needs from the image. Use `alt: ""` only for purely decorative images. Remote URLs aren't supported.

### `annotation`

A short callout.

```yaml
overlay:
  type: annotation
  text: The CLI waits until you approve the request.
```

## Actions and transitions

Actions appear on `auth-prompt` and `app-window` overlays. Clicking an action:

1. marks the step's gate as answered (if the step has `waitForAction`), and
2. jumps to `next` (or the following step) and plays from there.

A typical branch:

```yaml
steps:
  - id: approve
    overlay: { type: auth-prompt, title: Allow?, message: ..., actions: [{ label: Approve }, { label: Deny, next: denied }] }
    waitForAction: true
  - id: success
    terminal: { output: Signed in. }
    finish: true            # stop here so the denied path doesn't play next
  - id: denied
    terminal: { output: "Error: request denied." }
```

## Validation

Run `npm run validate` to check every file without writing anything. Errors name the file and the exact field:

```
demos/cli-signin.yaml
  - steps[1].overlay.actions[0].next: Unknown step "sucess". Known steps: signin, approve, success, list-projects, denied.
```

During `npm run dev`, the same errors appear in the terminal and in the browser's error overlay.
