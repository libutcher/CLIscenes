# Authoring reference

A walkthrough is one YAML (`.yaml`, `.yml`) or JSON file in `demos/`. The file name becomes the demo id, which is used in URLs. Use lowercase letters, numbers, and hyphens, for example `cli-signin.yaml`.

Nothing in a source file is ever executed. All output is text you write.

## Top level

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `title` | Yes | | Shown above the walkthrough. |
| `description` | No | `""` | One or two sentences under the title. |
| `prerequisites` | No | | What readers need before they start. Shown as a "Before you start" list. |
| `theme` | No | | Brand colors for this walkthrough. See [Theme](#theme). |
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

A desktop authentication request, drawn as a plain wireframe app window. Only `title`, `message`, and `actions` are required. The other fields add detail so the prompt looks like what the real app shows.

```yaml
overlay:
  type: auth-prompt
  app: Example Desktop       # optional, default "Desktop app"; shown in the title bar
  icon: assets/app-icon.svg  # optional; your app's icon (default: a generic icon)
  requester: Terminal        # optional; shown as an icon beside the app
  requesterIcon: assets/terminal.png  # optional (default: a terminal icon)
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

Icons are local image files, relative to the source file, like `image` overlays. Square images work best. They're shown at 52 × 52 pixels with rounded corners, so SVG or a PNG of at least 104 × 104 pixels stays sharp.

The prompt is a generic design. Use your own product's icon and colors (see [Theme](#theme)). When you model it on another product's prompt, copy its structure and wording, not its logo or brand colors.

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

Write `alt` text that describes what the reader needs from the image. Use `alt: ""` only for purely decorative images.

Image rules, which also apply to `icon` and `requesterIcon`:

- **Inside the walkthrough's folder:** the file must be in the same folder as the YAML file, or a folder below it, such as `demos/assets/`. Paths with `..`, absolute paths, and symlinks that point outside the folder are rejected. This keeps a walkthrough from publishing other files from your computer.
- **Images only:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, or `.svg`.
- **Local only:** remote URLs aren't supported.

#### Show a dialog as an image

An image can stand in for a real app's prompt, such as a Touch ID request. It can close by itself after a set time, or wait for the reader to click a button in the image. `demos/touch-id-signin.yaml` does both: the reader touches the sensor, then the approval animation plays and closes.

![A terminal runs "your-cli signin" and waits. A YourApp Touch ID prompt appears over the terminal with an account selector, and the sensor and Cancel button are outlined. A cursor selects the sensor, the fingerprint is read and shows Approved, then the prompt closes and the terminal shows the sign-in succeed and a list of projects.](media/touch-id.gif)

An image that closes by itself stays open for the step's `pause`:

```yaml
- id: touch-id
  title: Confirm with Touch ID
  overlay:
    type: image
    src: assets/touch-id-prompt.svg
    animation: assets/touch-id-prompt.css   # optional; see below
    frame: false                            # no card around the image
    alt: YourApp asks to confirm the sign-in, and Touch ID approves it.
  pause: 1.8                                # seconds the prompt stays open
```

| Field | Default | Description |
| --- | --- | --- |
| `frame` | `true` | Draw a card around the image. Use `false` for an image that is already a window, with its own edges and transparent corners. A "Simulated" label still appears below it. |
| `animation` | – | A CSS file that CLIscenes puts inside the SVG when it builds the walkthrough. SVG images only. |
| `srcReducedMotion` | – | An image to show instead to readers who ask for reduced motion, such as a still frame of an animated GIF. Made for you when you use `animation`. |
| `figma` | – | A link to the Figma frame the image comes from. See [Images from Figma](#images-from-figma). |
| `actions` | – | Buttons over the image, so the reader can click the buttons it shows. See [Clickable images](#clickable-images). |

**Animation.** An SVG shown in a web page can run CSS animations, but it can't load a separate stylesheet. So you keep the CSS in its own file, and CLIscenes adds it to the SVG at build time. That way a new export of the SVG never loses the animation.

- **Target layers by `id`.** The animation starts when the image appears. Use `animation-delay` to time each part, and `animation-fill-mode: forwards` to keep the end state.
- **Keep the timing short.** The image closes at the end of the step, so make `pause` a little longer than the animation.
- **Reduced motion.** Put movement inside `@media (prefers-reduced-motion: no-preference)`, and leave simple fades outside it. CLIscenes builds a second copy for readers who ask for reduced motion. In that copy, every `prefers-reduced-motion` query is answered as `reduce`. The player picks the copy itself, because browsers don't reliably pass the reader's setting into images.

`demos/assets/touch-id-prompt.css` is a commented example.

#### Clickable images

To make an image wait for the reader, add `actions` and set `waitForAction: true` on the step. Each action is a real button, placed over the button the image shows. It works like the buttons on an `auth-prompt`: `next` chooses the step to go to, so you can branch.

```yaml
- id: touch-id
  title: Touch the sensor to approve
  overlay:
    type: image
    src: assets/touch-id-prompt.svg
    frame: false
    alt: YourApp asks to confirm the sign-in, using Touch ID or a password.
    actions:
      - label: Approve with Touch ID        # what screen readers announce
        area: { x: 41.76%, y: 58.6%, width: 16.47%, height: 15.05% }
      - label: Cancel
        style: secondary
        area: { x: 70.74%, y: 88.84%, width: 23.24%, height: 7.8% }
        next: cancelled
  waitForAction: true
```

- **`area`** is where the button sits, as percentages of the image's width and height, measured from its top-left corner. Percentages keep the button in place at any size.
- **`layer`** can replace `area` for an image from Figma: give the name of the layer to click, and `cliscenes figma` works out the area. See [Images from Figma](#images-from-figma).
- **Label every action** with what it does, such as "Approve with Touch ID". The label isn't shown, because the image shows the button, but screen readers announce it.
- While the step waits, each area is outlined so readers can see where to click.

To play an animation after the click, show the image again with `animation` in the following step, as `touch-id-signin.yaml` does.

If an area ends up in the wrong place after a design change, the outline shows it. Areas from Figma layers stay in place as long as you run `cliscenes figma` after each change.

#### Images from Figma

Add a `figma` link to keep an image in step with a design in Figma. In Figma, select the frame, then choose **Copy link to selection**.

```yaml
overlay:
  type: image
  src: assets/touch-id-prompt.svg
  animation: assets/touch-id-prompt.css
  frame: false
  figma: https://www.figma.com/design/AbC123/Prompts?node-id=12-34
  alt: …
```

Then download the frame into `src`:

```sh
export FIGMA_TOKEN=…       # a personal access token; never commit it
npm run figma              # or: npx cliscenes figma <source-dir>
npm run figma -- --dry-run # list the links without downloading
```

- **Token.** Create a personal access token in Figma under **Settings > Security > Personal access tokens**, with the **File content: read** scope. Your account must be able to open the file.
- **When it runs.** Only when you run the command. Builds read the file that's already in the folder, so they work offline and give the same result every time. Commit the downloaded image like any other.
- **Format.** The extension of `src` sets the export format: `.svg`, `.png` (at 2×), or `.jpg`.
- **SVG exports** have text outlined, because an image in a web page can't load web fonts. Each layer's name becomes its `id`, so name the layers you animate, such as `fingerprint` or `approved`. If two layers share a name, Figma adds a suffix to the later one. Check the exported file if an animation doesn't start.
- **Corners and shadow.** Link to the dialog's own frame, not a larger frame with a background, so the area outside its rounded corners stays transparent. When the image floats over the terminal, the player adds a shadow, so the frame doesn't need one.
- **Privacy.** The `figma` link is never copied into the built walkthrough, so an internal file link isn't published.

**Click areas from layers.** For a [clickable image](#clickable-images), name the layer instead of measuring an area:

```yaml
actions:
  - label: Approve with Touch ID
    layer: fingerprint        # the layer's name in Figma
  - label: Cancel
    style: secondary
    layer: cancel
    next: cancelled
```

`cliscenes figma` then saves each layer's position in a file next to the image, such as `assets/touch-id-prompt.layers.json`. Commit it with the image. The build reads it to place each button.

- **Unique names.** The layer must be inside the linked frame, and its name must be unique there. Names are case-sensitive.
- **Click the layer's box.** The area is the layer's bounding box, so name a layer the size of the button, such as the button's frame, rather than its label text.
- **Format.** Click areas from Figma need an `.svg` or `.png` image.
- **If the build asks you to run `cliscenes figma`,** the positions file is missing, or doesn't have a layer you named. Check the name in Figma, then run the command again.

#### Try it with a Figma file

To test the Figma steps before you use them with a real design, make a test file from the example prompt:

1. In Figma, create a design file in an account you can use for testing.
2. Drag `demos/assets/touch-id-prompt.svg` into the file. Figma turns it into a frame.
3. In the **Layers** panel, find the fingerprint sensor's group and the **Cancel** button's group. Name them `fingerprint` and `cancel` if they aren't already. To keep the animation, also check that `ridges-active`, `approved`, `status`, `status-approved`, and `fingerprint-ring` have those names.
4. Select the frame, choose **Copy link to selection**, and create a token as described above.
5. Create `demos/figma-test.yaml` from the walkthrough below, and paste the link into `figma`.
6. In your terminal, set `FIGMA_TOKEN` and run `npm run figma`. It should print `updated` for `demos/assets/figma-test/prompt.svg`, and create `prompt.layers.json` next to it.
7. Run `npm run dev` and open the **Figma test** walkthrough. The outlines should sit over the sensor and **Cancel**. Select each one to check both paths.

```yaml
title: Figma test
steps:
  - id: signin
    title: Run a command
    terminal: { command: your-cli signin, output: Waiting for Touch ID in YourApp... }
  - id: prompt
    title: Touch the sensor
    overlay:
      type: image
      src: assets/figma-test/prompt.svg
      frame: false
      figma: https://www.figma.com/design/…   # paste your link
      alt: YourApp asks to confirm the sign-in.
      actions:
        - { label: Approve with Touch ID, layer: fingerprint }
        - { label: Cancel, style: secondary, layer: cancel, next: cancelled }
    waitForAction: true
  - id: approved
    title: Approved
    overlay:
      type: image
      src: assets/figma-test/prompt.svg
      animation: assets/touch-id-prompt.css
      frame: false
      alt: The fingerprint is read, and YourApp shows Approved.
    pause: 1.2
  - id: done
    title: Signed in
    terminal: { output: Signed in as demo@example.com }
    finish: true
  - id: cancelled
    title: Cancelled
    terminal: { clear: true, output: "Error: Touch ID was cancelled." }
```

When you're done, delete `demos/figma-test.yaml` and `demos/assets/figma-test/`, or keep them out of commits.

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
    terminal: { clear: true, output: "Error: request denied." }   # start the branch from a clean screen
```

### Jumps and the terminal

A walkthrough is one continuous recording, and a jump (an action's `next`, or the step list) moves to a point in it. After a jump, the terminal shows everything recorded up to the target step, not what was on screen when the reader clicked.

A branch placed after the main path would therefore show the main path's output above its own, so start each branch that's reached by a jump with `clear: true`. Then repeat anything the reader needs to see, such as the command they ran. A step with no `terminal` block leaves the terminal as it was.

## Theme

Give a walkthrough your brand colors. Each walkthrough has its own theme, so different demos on the same site can look different.

```yaml
theme:
  accent: "#0f7b6c"        # buttons, highlights, progress, the default app icon
  accentText: "#ffffff"    # optional: text on accent buttons (chosen automatically if omitted)
  dark:                    # optional: overrides for readers in dark mode
    accent: "#5eead4"
```

Colors are hex values (`#rgb` or `#rrggbb`). The player keeps text readable:

- Without `accentText`, button text is white or near-black, whichever contrasts better with the accent.
- If you set `accentText` and it contrasts less than 4.5:1 with the accent (the WCAG AA minimum for text), validation fails and names both colors.
- Accents are adjusted only as far as needed to stay visible: a pale accent is darkened slightly in light mode, and a dark one is lightened in dark mode (3:1 against the background, the WCAG minimum for controls and focus rings). Set `dark.accent` to choose a different dark-mode color; it gets the same safeguard.
- `accentText` and `dark.accentText` need an accent to go with them.

Everything else (surfaces, text, borders) follows the reader's light or dark setting.

## Validation

Run `npm run validate` to check every file without writing anything. Errors name the file and the exact field:

```
demos/cli-signin.yaml
  - steps[1].overlay.actions[0].next: Unknown step "sucess". Known steps: signin, approve, success, list-projects, denied.
```

During `npm run dev`, the same errors appear in the terminal and in the browser's error overlay.
