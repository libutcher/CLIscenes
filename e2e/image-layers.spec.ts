import { expect, test } from "@playwright/test";

/**
 * The two image workflows the README documents:
 *
 * - figma-touch-id places its buttons from layer names in a positions file,
 *   which `cliscenes figma` writes from a design and a person can write by
 *   hand. The areas must land on the same buttons as the measured ones.
 * - static-screenshot has no actions at all, so it never waits and runs
 *   start to finish on one path.
 */
test("areas placed from layer names sit over the buttons they name", async ({ page }) => {
  await page.goto("?demo=figma-touch-id");
  const prompt = page.getByRole("img", { name: /YourApp asks to confirm/ });
  const approve = page.getByRole("button", { name: "Approve with Touch ID" });

  await page.getByRole("button", { name: "Play" }).click();
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeVisible();

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
  const terminal = page.getByRole("region", { name: /Terminal/ });
  await expect(terminal).toContainText("Approved with Touch ID", { timeout: 10_000 });
});

test("Cancel from a layer-placed area jumps to its branch", async ({ page }) => {
  await page.goto("?demo=figma-touch-id");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 10_000 });
  await expect(terminal).toContainText("Touch ID was cancelled", { timeout: 10_000 });
  await expect(terminal).not.toContainText("Approved with Touch ID");
});

test("a screenshot with no actions never waits, and the walkthrough runs on one path", async ({ page }) => {
  await page.goto("?demo=static-screenshot");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  const screenshot = page.getByRole("img", { name: /YourApp settings/ });

  await page.getByRole("button", { name: "Play" }).click();
  await expect(screenshot).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeHidden();

  // It closes by itself, and the terminal reaches the end with no clicks.
  await expect(screenshot).toBeHidden({ timeout: 10_000 });
  await expect(terminal).toContainText("CLI integration: on", { timeout: 10_000 });
});
