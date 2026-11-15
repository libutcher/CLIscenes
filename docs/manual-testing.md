# Manual browser testing checklist

Run `npm run dev` and open the printed URL. Repeat the key items in Chrome, Firefox, and Safari before a release.

## Guided playback (`cli-signin`)

- [ ] Before you select Play, nothing appears outside the terminal except the placeholder text.
- [ ] Select **Play**. The command types, then "Waiting for approval…" appears.
- [ ] The **Allow CLI sign-in?** dialog appears, and the play button changes to "Waiting for your action".
- [ ] Wait at least 5 seconds. "Signed in as…" does **not** appear.
- [ ] Selecting the play button while waiting does nothing.
- [ ] Select **Approve**. The dialog closes, and "Signed in as…" then the project list appear.
- [ ] Playback stops after the project list. The denied path does not play, and the button says "Replay".

## Branches and navigation

- [ ] Play to the dialog and select **Deny**. The terminal clears and shows the denied error. The step label shows step 5 of 5.
- [ ] After approving, select **Previous step**. The dialog appears again and playback waits again.
- [ ] Select step 4 in the step list without approving. Step 2 shows "Skipped".
- [ ] **Restart** clears every "Done" and "Skipped" badge and plays from step 1.
- [ ] **Pause** mid-command, wait, then **Play**. Playback continues from the same character.
- [ ] Select the dialog's action button before playback reaches the pause point. Playback continues without stopping.

## Text and copying

- [ ] Select terminal text with the mouse and copy it (Cmd/Ctrl+C). The pasted text matches.
- [ ] **Copy command** copies the current step's command (or the most recent one) and shows "Copied".
- [ ] Copy command works inside `embed-example.html`.

## Keyboard and screen readers

- [ ] Every control can be reached with Tab and shows a visible focus ring.
- [ ] Select Play with the keyboard. When the dialog appears, focus moves to **Approve**, and Enter approves.
- [ ] With focus elsewhere on the page (not in the walkthrough), the dialog does **not** steal focus or scroll the page.
- [ ] Pressing Space, arrow keys, `[` or `]` while the terminal text has focus does not start or skip playback.
- [ ] With VoiceOver or NVDA: step changes are announced, and the waiting announcement names the available actions.
- [ ] The dialog is announced as a dialog with its title and message.
- [ ] The image in `cli-setup` step 1 has meaningful alt text.

## Layout and display

- [ ] **Split** (`cli-signin`) at 1280px wide: the dialog sits beside the terminal.
- [ ] **Overlay** (`cli-setup`) at 1280px wide: the settings window floats over the lower right without covering typed commands, and the teal theme applies in light and dark mode.
- [ ] At 390px wide: both layouts stack vertically, with no horizontal page scrolling.
- [ ] Dark mode (operating system setting): every surface, badge, and button is readable.
- [ ] Reduced motion (operating system setting): overlays appear without animation.

## Authoring loop

- [ ] With `npm run dev` running, change an output line in `demos/cli-signin.yaml` and save. The page reloads with the change.
- [ ] Introduce a typo in a `next:` value. The browser shows an error overlay naming the file and field. Fix it, and the page recovers.
- [ ] `npm run build && npm run preview`: `embed-example.html` loads the walkthrough in an iframe, and the iframe resizes to fit.
