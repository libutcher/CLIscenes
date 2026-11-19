import { expect, test } from "@playwright/test";

/**
 * The image overlay, as the one example walkthrough uses it: a design shown
 * over the terminal, with a clickable area over each button. The areas come
 * from layer names looked up in a hand-written positions file, so this also
 * covers using an image with no Figma link at all.
 */
const DEMO = "figma-touch-id";

test("an image prompt waits for the reader, with its areas over the buttons they name", async ({ page }) => {
  await page.goto(`?demo=${DEMO}`);
  const terminal = page.getByRole("region", { name: /Terminal/ });
  const prompt = page.getByRole("img", { name: /YourApp asks to confirm/ });
  const approve = page.getByRole("button", { name: "Approve with Touch ID" });

  await page.getByRole("button", { name: "Play" }).click();
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("region", { name: "Outside the terminal" })).toContainText("Simulated");
  await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeVisible();

  // The walkthrough stays at the prompt until the reader acts.
  await page.waitForTimeout(2_000);
  await expect(prompt).toBeVisible();
  await expect(terminal).not.toContainText("Approved with Touch ID");

  // The sensor sits in the middle of the image; Cancel sits bottom right.
  const image = (await prompt.boundingBox())!;
  const sensor = (await approve.boundingBox())!;
  expect(sensor.x).toBeGreaterThan(image.x + image.width * 0.35);
  expect(sensor.x + sensor.width).toBeLessThan(image.x + image.width * 0.65);

  // `exact` keeps this off the "If you cancel" button in the step list.
  const cancel = (await page.getByRole("button", { name: "Cancel", exact: true }).boundingBox())!;
  expect(cancel.x).toBeGreaterThan(image.x + image.width * 0.65);
  expect(cancel.y).toBeGreaterThan(image.y + image.height * 0.8);

  await approve.click();
  const approved = page.getByRole("img", { name: /fingerprint is read/ });
  await expect(approved).toBeVisible();
  await expect(approved).toHaveAttribute("src", /prompt\.svg$/);
  await expect(approved).toBeHidden({ timeout: 10_000 });
  await expect(terminal).toContainText("Approved with Touch ID", { timeout: 10_000 });
  await expect(terminal).toContainText("Internal tools", { timeout: 10_000 });
  await expect(terminal).not.toContainText("Touch ID was cancelled");
});

test("Cancel jumps to its branch on a screen cleared of the main path", async ({ page }) => {
  await page.goto(`?demo=${DEMO}`);
  const terminal = page.getByRole("region", { name: /Terminal/ });
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 10_000 });

  await expect(terminal).toContainText("Touch ID was cancelled", { timeout: 10_000 });
  // The branch clears before it begins, so the main path's project list is
  // never on screen beside the cancellation.
  await expect(terminal).not.toContainText("Approved with Touch ID");
  await expect(terminal).not.toContainText("Internal tools");
});

test("readers who ask for reduced motion get the still copy of the animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`?demo=${DEMO}`);
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Approve with Touch ID" }).click({ timeout: 10_000 });
  const approved = page.getByRole("img", { name: /fingerprint is read/ });
  await expect(approved).toHaveAttribute("src", /prompt\.reduced-motion\.svg$/);
});
