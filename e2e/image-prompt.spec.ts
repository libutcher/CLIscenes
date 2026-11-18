import { expect, test } from "@playwright/test";

/**
 * The Touch ID example: an animated image prompt appears after the command,
 * holds, and closes on its own before the terminal continues.
 */
test("an image prompt appears and closes before the terminal continues", async ({ page }) => {
  await page.goto("?demo=touch-id-signin");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  const prompt = page.getByRole("img", { name: /YourApp asks to confirm/ });

  await page.getByRole("button", { name: "Play" }).click();
  await expect(terminal).toContainText("your-cli signin");
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(prompt).toHaveAttribute("src", /touch-id-prompt\.svg$/);
  await expect(page.getByRole("region", { name: "Outside the terminal" })).toContainText("Simulated");
  // Nothing after the prompt is shown while it's open.
  await expect(terminal).not.toContainText("Approved with Touch ID");

  // No action is needed: it closes, then the terminal continues.
  await expect(prompt).toBeHidden({ timeout: 10_000 });
  await expect(terminal).toContainText("Approved with Touch ID", { timeout: 10_000 });
  await expect(terminal).toContainText("Internal tools", { timeout: 10_000 });
});

test("readers who ask for reduced motion get the still copy of the prompt", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("?demo=touch-id-signin");
  await page.getByRole("button", { name: "Play" }).click();
  const prompt = page.getByRole("img", { name: /YourApp asks to confirm/ });
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(prompt).toHaveAttribute("src", /touch-id-prompt\.reduced-motion\.svg$/);
});
