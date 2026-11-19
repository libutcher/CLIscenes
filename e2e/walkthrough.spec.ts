import { expect, test } from "@playwright/test";

/**
 * Player mechanics, checked against the one example walkthrough. The image
 * overlay itself is covered by image-prompt.spec.ts.
 */
const DEMO = "figma-touch-id";
const TITLE = "Sign in to a CLI with Touch ID, from a design";

test("the gate holds the rest of the walkthrough back until the reader acts", async ({ page }) => {
  await page.goto(`?demo=${DEMO}`);
  const terminal = page.getByRole("region", { name: /Terminal/ });
  const prompt = page.getByRole("img", { name: /YourApp asks to confirm/ });

  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
  await page.getByRole("button", { name: "Play" }).click();

  await expect(terminal).toContainText("your-cli signin");
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeVisible();

  // Give playback every chance to run ahead. It must stay stopped at the gate.
  await page.waitForTimeout(2_500);
  await expect(terminal).not.toContainText("Signed in as demo@example.com");
  await expect(prompt).toBeVisible();

  // The player's own keyboard shortcuts must not be able to skip the gate.
  await terminal.locator("pre").focus();
  for (const key of [" ", "]", "ArrowRight", "."]) await page.keyboard.press(key);
  await page.waitForTimeout(1_000);
  await expect(terminal).not.toContainText("Signed in as demo@example.com");

  // Terminal text is real, selectable text.
  const selected = await terminal.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(selected).toContain("Waiting for Touch ID in YourApp");

  await page.getByRole("button", { name: "Approve with Touch ID" }).click();
  await expect(terminal).toContainText("Signed in as demo@example.com", { timeout: 10_000 });
  await expect(terminal).toContainText("your-cli projects list", { timeout: 10_000 });
  await expect(terminal).toContainText("Internal tools", { timeout: 10_000 });

  // The main path ends at the project list; the Cancel branch does not play on.
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible({ timeout: 10_000 });
  await expect(terminal).not.toContainText("Touch ID was cancelled");

  // Going back to the gated step asks for the action again.
  await page
    .getByRole("navigation", { name: "Walkthrough steps" })
    .getByRole("button", { name: /Touch the sensor to approve/ })
    .click();
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(terminal).not.toContainText("Signed in as demo@example.com");
});

test("choosing Cancel jumps to the other path", async ({ page }) => {
  await page.goto(`?demo=${DEMO}`);
  const terminal = page.getByRole("region", { name: /Terminal/ });

  await page.getByRole("button", { name: "Play" }).click();
  // `exact` keeps this off the "If you cancel" button in the step list.
  await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 10_000 });

  await expect(terminal).toContainText("Touch ID was cancelled", { timeout: 10_000 });
  await expect(terminal).not.toContainText("Signed in as");
  await expect(page.getByText("Step 6 of 6", { exact: true })).toBeVisible();
});

test.describe("host-controlled theme", () => {
  const surface = (page: import("@playwright/test").Page) =>
    page.locator(".cs-walkthrough").evaluate((el) => getComputedStyle(el).backgroundColor);
  const WHITE = "rgb(255, 255, 255)";

  test("?theme=dark overrides a light system setting, and messages switch it live", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`?demo=${DEMO}&theme=dark`);
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    expect(await surface(page)).not.toBe(WHITE);

    await page.evaluate(() => window.postMessage({ type: "cliscenes:set-theme", theme: "light" }, "*"));
    await expect.poll(() => surface(page)).toBe(WHITE);

    // "auto" goes back to following the system.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => window.postMessage({ type: "cliscenes:set-theme", theme: "auto" }, "*"));
    await expect.poll(() => surface(page)).not.toBe(WHITE);
  });

  test("ignores invalid theme values", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`?demo=${DEMO}&theme=purple`);
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    expect(await surface(page)).toBe(WHITE);
  });
});

test("reduced motion shows commands without the typing animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const castRequest = page.waitForRequest((r) => r.url().endsWith(".cast"));
  await page.goto(`?demo=${DEMO}`);
  expect((await castRequest).url()).toContain("demo.reduced-motion.cast");

  const terminal = page.getByRole("region", { name: /Terminal/ });
  await page.getByRole("button", { name: "Play" }).click();
  // The full command appears in one go; with typing, "your-cli" would show first.
  await expect(terminal).toContainText("your-cli signin", { timeout: 5_000 });
  await expect(page.getByRole("img", { name: /YourApp asks to confirm/ })).toBeVisible({ timeout: 10_000 });
});

test.describe("embed options", () => {
  test("embeds show only the terminal and controls by default", async ({ page }) => {
    await page.goto(`?demo=${DEMO}&embed=1`);
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("heading", { name: TITLE })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Walkthrough steps" })).toHaveCount(0);
    // The walkthrough still has an accessible name.
    await expect(page.getByRole("region", { name: `Interactive walkthrough: ${TITLE}` })).toBeVisible();
    // Gates still work without the step list.
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeVisible({ timeout: 10_000 });
  });

  test("header=1 and steps=1 add the title and step list back", async ({ page }) => {
    await page.goto(`?demo=${DEMO}&embed=1&header=1&steps=1`);
    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Walkthrough steps" })).toBeVisible();
    await expect(page.getByRole("region", { name: TITLE })).toBeVisible();
  });
});

test("player styles are applied to controls and the step list", async ({ page }) => {
  // Functional tests pass even with missing CSS, so check a few key styles.
  await page.goto(`?demo=${DEMO}`);
  const play = page.getByRole("button", { name: "Play" });
  await expect(play).toBeVisible();
  expect(await play.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("8px");
  const list = page.getByRole("navigation", { name: "Walkthrough steps" }).locator("ol");
  expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe("flex");
  expect(await list.evaluate((el) => getComputedStyle(el).listStyleType)).toBe("none");
});
