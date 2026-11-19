# Authoring reference

A walkthrough is one YAML (`.yaml`, `.yml`) or JSON file in `demos/`. The file name becomes the demo id, which is used in URLs. Use lowercase letters, numbers, and hyphens, for example `sign-in.yaml`.

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

An image with no `actions` is simply shown: the step holds it for `pause` seconds and moves on, and the walkthrough never waits. A walkthrough built only from images like that has one path from start to finish, needs no layer names, no positions file, and no Figma link, and works with any image file. Add `actions` when the reader should click something in the image, as described in [Clickable images](#clickable-images).

Image rules, which also apply to `icon` and `requesterIcon`:

- **Inside the walkthrough's folder:** the file must be in the same folder as the YAML file, or a folder below it, such as `demos/assets/`. Paths with `..`, absolute paths, and symlinks that point outside the folder are rejected. This keeps a walkthrough from publishing other files from your computer.
- **Images only:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, or `.svg`.
- **Local only:** remote URLs aren't supported.

#### Show a dialog as an image

An image can stand in for a real app's prompt, such as a Touch ID request. It can close by itself after a set time, or wait for the reader to click a button in the image. `demos/figma-touch-id.yaml` does this: the reader touches the sensor, then the approval animation plays and closes.

[![A terminal runs "your-cli signin" and waits. A YourApp Touch ID prompt appears over the terminal with an account selector, and the sensor and Cancel button are outlined. A cursor selects the sensor, the fingerprint is read and shows Approved, then the prompt closes and the terminal shows the sign-in succeed and a list of projects.](media/interactive-approve.gif)](https://libutcher.github.io/CLIscenes/embed-example.html)

An image that closes by itself stays open for the step's `pause`:

```yaml
- id: touch-id
  title: Confirm with Touch ID
  overlay:
    type: image
    src: assets/figma-touch-id/prompt.svg
    animation: assets/figma-touch-id/prompt.css   # optional; see below
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

`demos/assets/figma-touch-id/prompt.css` is a commented example.

#### Clickable images

To make an image wait for the reader, add `actions` and set `waitForAction: true` on the step. Each action is a real button, placed over the button the image shows. It works like the buttons on an `auth-prompt`: `next` chooses the step to go to, so you can branch.

```yaml
- id: touch-id
  title: Touch the sensor to approve
  overlay:
    type: image
    src: assets/figma-touch-id/prompt.svg
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
- **`layer`** can replace `area`: give the name of the layer to click, and its position is read from a positions file next to the image. See [Click areas from layer names](#click-areas-from-layer-names).
- **Label every action** with what it does, such as "Approve with Touch ID". The label isn't shown, because the image shows the button, but screen readers announce it.
- While the step waits, each area is outlined so readers can see where to click.

To play an animation after the click, show the image again with `animation` in the following step, as `figma-touch-id.yaml` does.

If an area ends up in the wrong place after a design change, the outline shows it. Areas placed by layer name stay put as long as the positions file is kept up to date.

#### Click areas from layer names

A measured `area` is a number someone has to measure again every time the design moves. Naming the layer instead moves that job into a file you can regenerate:

```yaml
actions:
  - label: Approve with Touch ID
    layer: fingerprint        # the layer's name in the design
  - label: Cancel
    style: secondary
    layer: cancel
    next: cancelled
```

The position comes from a positions file beside the image, named after it: `assets/prompt.svg` pairs with `assets/prompt.layers.json`. The build reads that file, turns each `layer` into an `area`, and never contacts Figma. Commit it with the image.

```json
{
  "width": 340,
  "height": 372,
  "layers": {
    "fingerprint": { "x": 142, "y": 218, "width": 56, "height": 56 },
    "cancel": { "x": 240.5, "y": 330.5, "width": 79, "height": 29 }
  }
}
```

- **`width` and `height`** are the image's own size at 1×. Every box is in those pixels, measured from the image's top-left corner. The build converts them to percentages, so the buttons hold their place at any display size.
- **Only the layers you click** need an entry. Layers that are only animated, such as `ridges-active`, are matched by `id` inside the SVG and don't belong here.
- **Names are unique and case-sensitive.** Two layers with one name is an error, because there's no way to tell which one to click.
- **Box the button, not its label.** The area is the whole box, so name a layer the size of the button rather than the text inside it.
- **Format.** Click areas need an `.svg` or `.png` image.

There are two ways to get the file, and the YAML is identical either way:

| How | Use it when | Keeping it current |
| --- | --- | --- |
| `cliscenes figma` writes it | You can open the design in Figma | Re-run the command after each design change |
| You write it yourself | You have no Figma access, or the image doesn't come from Figma | Edit the numbers when the image changes |

**If the build asks for positions,** the file is missing, or it doesn't list a layer that an action names. The message names both the file and the layer.

#### Images from Figma

Add a `figma` link to keep an image in step with a design in Figma. In Figma, select the frame, then choose **Copy link to selection**.

```yaml
overlay:
  type: image
  src: assets/figma-touch-id/prompt.svg
  animation: assets/figma-touch-id/prompt.css
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

`cliscenes figma` writes two things for each linked image: the image itself, and the positions file for any layers the actions name.

- **Token.** Create a personal access token in Figma under **Settings > Security > Personal access tokens**, with the **File content: read** scope. The token inherits your access, so your account must be able to open the file. Some organizations switch personal access tokens off; if the setting isn't there, ask whoever administers your Figma organization.
- **The link is optional.** `layer` works without `figma`, as long as the positions file is there. Only `cliscenes figma` needs the link, so a walkthrough with a hand-written positions file leaves `figma` out and the command skips the image.
- **When it runs.** Only when you run the command. Builds read the file that's already in the folder, so they work offline and give the same result every time. Commit the downloaded image like any other.
- **Format.** The extension of `src` sets the export format: `.svg`, `.png` (at 2×), or `.jpg`.
- **SVG exports** have text outlined, because an image in a web page can't load web fonts. Each layer's name becomes its `id`, so name the layers you animate, such as `fingerprint` or `approved`. If two layers share a name, Figma adds a suffix to the later one. Check the exported file if an animation doesn't start.
- **Corners and shadow.** Link to the dialog's own frame, not a larger frame with a background, so the area outside its rounded corners stays transparent. When the image floats over the terminal, the player adds a shadow, so the frame doesn't need one.
- **Privacy.** The `figma` link is never copied into the built walkthrough, so an internal file link isn't published.

#### Writing a positions file by hand

Use this when you can't open the design in Figma, or the image didn't come from Figma at all. `demos/figma-touch-id.yaml` is a working example: it ships with no `figma` link, its positions file is written by hand, and it builds with no Figma account and no token.

1. Find the image's size at 1×. For an SVG, that's the `width` and `height` on the root element.
2. For each button, find its box in those same pixels. In an SVG, a button is usually one shape: `<rect x="240.5" y="330.5" width="79" height="29">` is the box. For a PNG, measure it in any image editor.
3. Write `<image-name>.layers.json` beside the image, in the shape above, with one entry per layer an action names.
4. Run `npm run validate`, then `npm run dev` and step to the image. While the walkthrough waits, each area is outlined, so a wrong number is visible rather than silent.

The file is the same shape `cliscenes figma` writes, so adding a `figma` link later replaces it without touching the YAML.

#### Try it with a Figma file

To test the Figma steps against a real design, make a test file from the example prompt:

1. In Figma, create a design file in an account you can use for testing.
2. Drag `demos/assets/figma-touch-id/prompt.svg` into the file. Figma turns it into a frame, and the SVG's ids become the layer names.
3. In the **Layers** panel, check that the sensor group and the **Cancel** button group are named `fingerprint` and `cancel`. To keep the animation, also check `ridges-active`, `approved`, `status`, `status-approved`, and `fingerprint-ring`.
4. Select the frame, choose **Copy link to selection**, and create a token as described above.
5. Copy `demos/figma-touch-id.yaml` to `demos/figma-test.yaml`. In the copy, change `title` to `Figma test`, change each `src` to `assets/figma-test/prompt.svg`, and add your link as `figma:` on both image overlays.
6. Set `FIGMA_TOKEN` and run `npm run figma`. It should print `updated` for `demos/assets/figma-test/prompt.svg` and write `prompt.layers.json` next to it.
7. Run `npm run dev` and open **Figma test**. The outlines should sit over the sensor and **Cancel**. Select each one to check both paths.
8. Move the **Cancel** button in Figma, run `npm run figma` again, and reload. The click area follows the button.

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
demos/figma-touch-id.yaml
  - steps[1].overlay.actions[1].next: Unknown step "canceled". Known steps: signin, touch-id, approved, signed-in, list-projects, cancelled.
```

During `npm run dev`, the same errors appear in the terminal and in the browser's error overlay.
