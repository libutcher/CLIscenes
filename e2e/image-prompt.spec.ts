import { expect, test } from "@playwright/test";

/**
 * The Touch ID example: an image prompt with clickable areas waits for the
 * reader. Touching the sensor plays the approval animation, which closes on
 * its own before the terminal continues. Cancel jumps to another branch.
 */
test("an image prompt waits for the reader, then plays the approval", async ({ page }) => {
  await page.goto("?demo=touch-id-signin");
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

  // The clickable area sits over the sensor in the image.
  const image = (await prompt.boundingBox())!;
  const area = (await approve.boundingBox())!;
  expect(area.x).toBeGreaterThan(image.x + image.width * 0.35);
  expect(area.x + area.width).toBeLessThan(image.x + image.width * 0.65);

  await approve.click();
  const approved = page.getByRole("img", { name: /fingerprint is read/ });
  await expect(approved).toBeVisible();
  await expect(approved).toHaveAttribute("src", /touch-id-prompt\.svg$/);
  await expect(approved).toBeHidden({ timeout: 10_000 });
  await expect(terminal).toContainText("Approved with Touch ID", { timeout: 10_000 });
  await expect(terminal).toContainText("Internal tools", { timeout: 10_000 });
  await expect(terminal).not.toContainText("Touch ID was cancelled");
});

test("Cancel on an image prompt jumps to its branch", async ({ page }) => {
  await page.goto("?demo=touch-id-signin");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Cancel" }).click({ timeout: 10_000 });
  await expect(terminal).toContainText("Touch ID was cancelled", { timeout: 10_000 });
  await expect(terminal).not.toContainText("Approved with Touch ID");
});

test("readers who ask for reduced motion get the still copy of the animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("?demo=touch-id-signin");
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Approve with Touch ID" }).click({ timeout: 10_000 });
  const approved = page.getByRole("img", { name: /fingerprint is read/ });
  await expect(approved).toHaveAttribute("src", /touch-id-prompt\.reduced-motion\.svg$/);
});
