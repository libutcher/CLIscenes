# Manual browser testing checklist

Run `npm run dev` and open the printed URL. Repeat the key items in Chrome, Firefox, and Safari before a release.

`demos/figma-touch-id.yaml` is the one example walkthrough, so every check below uses it.

## Guided playback

- [ ] Before you select Play, nothing appears outside the terminal.
- [ ] Select **Play**. The command types, then "Waiting for Touch ID in YourApp…" appears.
- [ ] The Touch ID prompt appears beside the terminal, carries a "Simulated" label, and the play button changes to "Waiting for your action".
- [ ] While the step waits, the click areas over the sensor and **Cancel** are outlined.
- [ ] Wait at least 5 seconds. "Signed in as…" does **not** appear.
- [ ] Selecting the play button while waiting does nothing.
- [ ] Select the sensor. The approval animation plays, the ridges fill in, and the prompt shows "Approved" before it closes.
- [ ] "Approved with Touch ID", "Signed in as…", then the project list appear.
- [ ] Playback stops after the project list. The cancelled path does not play, and the button says "Replay".

## Branches and navigation

- [ ] Play to the prompt and select **Cancel**. The terminal shows the cancellation on a clean screen: the project list is **not** visible, not even for a moment as the branch starts. The step label shows step 6 of 6.
- [ ] After approving, select **Previous step**. The prompt appears again and playback waits again.
- [ ] Select step 5 in the step list without approving. Step 2 shows "Skipped".
- [ ] **Restart** clears every "Done" and "Skipped" badge and plays from step 1.
- [ ] **Pause** mid-command, wait, then **Play**. Playback continues from the same character.
- [ ] Select the sensor before playback reaches the pause point. Playback continues without stopping.

## Text and copying

- [ ] Select terminal text with the mouse and copy it (Cmd/Ctrl+C). The pasted text matches.
- [ ] **Copy command** copies the current step's command (or the most recent one) and shows "Copied".
- [ ] Copy command works inside `embed-example.html`.

## Keyboard and screen readers

- [ ] Every control can be reached with Tab and shows a visible focus ring.
- [ ] Select Play with the keyboard. When the prompt appears, focus moves to **Approve with Touch ID**, and Enter approves.
- [ ] With focus elsewhere on the page (not in the walkthrough), the prompt does **not** steal focus or scroll the page.
- [ ] Pressing Space, arrow keys, `[` or `]` while the terminal text has focus does not start or skip playback.
- [ ] With VoiceOver or NVDA: step changes are announced, and the waiting announcement names the available actions.
- [ ] The prompt's image is announced with its alt text, and each click area with its label ("Approve with Touch ID", "Cancel").

## Layout and display

- [ ] At 1280px wide: the prompt floats over the upper right of the terminal without covering the typed command, and is never cut off.
- [ ] **Theme:** the teal accent applies to buttons and progress, in light and dark mode.
- [ ] At 390px wide: the prompt stacks below the terminal, with no horizontal page scrolling.
- [ ] Dark mode (operating system setting): every surface, badge, and button is readable.
- [ ] Reduced motion (operating system setting): overlays appear without animation, commands appear whole instead of being typed, and the approval shows the still image rather than the animated one.
- [ ] `?demo=figma-touch-id&theme=dark` shows dark mode with a light system setting, and `&theme=light` the reverse.

## Authoring loop

- [ ] With `npm run dev` running, change an output line in `demos/figma-touch-id.yaml` and save. The page reloads with the change.
- [ ] Introduce a typo in a `next:` value. The browser shows an error overlay naming the file and field. Fix it, and the page recovers.
- [ ] Rename a layer in `demos/assets/figma-touch-id/prompt.layers.json`. The build fails and names the layer it can no longer find.
- [ ] `npm run build && npm run preview`: `embed-example.html` loads the walkthrough in an iframe, and the iframe resizes to fit.
