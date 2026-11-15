import { expect, test } from "@playwright/test";

/**
 * Smoke test for the sign-in example: the success message must not appear
 * before the reader approves, and must appear after.
 */
test("authentication prompt gates the rest of the walkthrough", async ({ page }) => {
  await page.goto("?demo=cli-signin");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  const dialog = page.getByRole("dialog", { name: "Allow CLI sign-in?" });

  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
  await page.getByRole("button", { name: "Play" }).click();

  await expect(terminal).toContainText("your-cli signin");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeVisible();

  // Give playback every chance to run ahead. It must stay stopped at the gate.
  await page.waitForTimeout(2_500);
  await expect(terminal).not.toContainText("Signed in as demo@example.com");
  await expect(dialog).toBeVisible();

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
  expect(selected).toContain("Waiting for approval in YourApp");

  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(dialog).toBeHidden();
  await expect(terminal).toContainText("Signed in as demo@example.com", { timeout: 10_000 });
  await expect(terminal).toContainText("your-cli projects list", { timeout: 10_000 });
  await expect(terminal).toContainText("Internal tools", { timeout: 10_000 });

  // The main path ends at the project list; the Deny branch does not play on.
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible({ timeout: 10_000 });
  await expect(terminal).not.toContainText("sign-in request was denied");

  // Going back to the gated step asks for approval again.
  await page.getByRole("navigation", { name: "Walkthrough steps" }).getByRole("button", { name: /Approve the sign-in request/ }).click();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(terminal).not.toContainText("Signed in as demo@example.com");
});

test("choosing Deny jumps to the denied path", async ({ page }) => {
  await page.goto("?demo=cli-signin");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  const dialog = page.getByRole("dialog", { name: "Allow CLI sign-in?" });

  await page.getByRole("button", { name: "Play" }).click();
  await dialog.getByRole("button", { name: "Deny" }).click();

  await expect(dialog).toBeHidden();
  await expect(terminal).toContainText("sign-in request was denied", { timeout: 10_000 });
  await expect(terminal).not.toContainText("Signed in as");
  await expect(page.getByText("Step 5 of 5", { exact: true })).toBeVisible();
});

test.describe("host-controlled theme", () => {
  const surface = (page: import("@playwright/test").Page) =>
    page.locator(".cs-walkthrough").evaluate((el) => getComputedStyle(el).backgroundColor);
  const WHITE = "rgb(255, 255, 255)";

  test("?theme=dark overrides a light system setting, and messages switch it live", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("?demo=cli-signin&theme=dark");
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
    await page.goto("?demo=cli-signin&theme=purple");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    expect(await surface(page)).toBe(WHITE);
  });
});

test("reduced motion shows commands without the typing animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const castRequest = page.waitForRequest((r) => r.url().endsWith(".cast"));
  await page.goto("?demo=cli-signin");
  expect((await castRequest).url()).toContain("demo.reduced-motion.cast");

  const terminal = page.getByRole("region", { name: /Terminal/ });
  await page.getByRole("button", { name: "Play" }).click();
  // The full command appears in one go; with typing, "your-cli" would show first.
  await expect(terminal).toContainText("your-cli signin", { timeout: 5_000 });
  await expect(page.getByRole("dialog", { name: "Allow CLI sign-in?" })).toBeVisible({ timeout: 10_000 });
});

test.describe("embed options", () => {
  test("embeds show only the terminal and controls by default", async ({ page }) => {
    await page.goto("?demo=cli-signin&embed=1");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to a CLI with a desktop app" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Walkthrough steps" })).toHaveCount(0);
    // The walkthrough still has an accessible name.
    await expect(page.getByRole("region", { name: "Interactive walkthrough: Sign in to a CLI with a desktop app" })).toBeVisible();
    // Gates still work without the step list.
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("dialog", { name: "Allow CLI sign-in?" })).toBeVisible({ timeout: 10_000 });
  });

  test("header=1 and steps=1 add the title and step list back", async ({ page }) => {
    await page.goto("?demo=cli-signin&embed=1&header=1&steps=1");
    await expect(page.getByRole("heading", { name: "Sign in to a CLI with a desktop app" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Walkthrough steps" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Sign in to a CLI with a desktop app" })).toBeVisible();
  });
});

test("player styles are applied to controls and the step list", async ({ page }) => {
  // Functional tests pass even with missing CSS, so check a few key styles.
  await page.goto("?demo=cli-signin");
  const play = page.getByRole("button", { name: "Play" });
  await expect(play).toBeVisible();
  expect(await play.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("8px");
  const list = page.getByRole("navigation", { name: "Walkthrough steps" }).locator("ol");
  expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe("flex");
  expect(await list.evaluate((el) => getComputedStyle(el).listStyleType)).toBe("none");
});


test("static screenshot keeps terminal gated until the reader continues", async ({ page }) => {
  await page.goto("?demo=cli-signin-screenshot");
  const terminal = page.getByRole("region", { name: /Terminal/ });
  await page.getByRole("button", { name: "Play" }).click();

  const screenshot = page.getByRole("img", { name: /Example YourApp approval prompt/ });
  await expect(screenshot).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Show expected result" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for your action" })).toBeVisible();

  // The screenshot is static; no live auth or fake dialog interaction.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(1_500);
  await expect(terminal).not.toContainText("Signed in as demo@example.com");

  await page.getByRole("button", { name: "Show expected result" }).click();
  await expect(terminal).toContainText("Signed in as demo@example.com", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible({ timeout: 10_000 });
});
