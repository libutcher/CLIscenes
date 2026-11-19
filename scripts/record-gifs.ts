/**
 * Record the README's demo GIFs from the built player.
 *
 *   npm run gifs                      (builds first, then writes docs/media/*.gif)
 *   npm run gifs -- interactive-cancel.gif   record only the named GIFs
 *
 * Each recording plays a walkthrough in a headless browser, clicks through it
 * with a visible cursor, and screenshots the walkthrough about 10 times a
 * second. The frames are encoded with gifenc. No ffmpeg needed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import gifenc from "gifenc";
import { preview } from "vite";

// gifenc is published as CommonJS, so take its functions from the default export.
const { applyPalette, GIFEncoder, quantize } = gifenc;

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "docs/media");
const FRAME_MS = 100;
/** Color scheme for the GIFs. */
const THEME: "light" | "dark" = "dark";
/** Pixel density. 2 keeps text sharp on high-resolution screens; GitHub scales the GIF to fit. */
const SCALE = 2;

interface Recording {
  file: string;
  demo: string;
  /** Clicks through the walkthrough. Frames are captured while it runs. */
  script: (page: Page, click: (target: Locator) => Promise<void>) => Promise<void>;
}

const recordings: Recording[] = [
  {
    // One recording per path through the one example walkthrough, because the
    // branch is the point: the reader's choice changes what the terminal shows.
    file: "interactive-approve.gif",
    demo: "figma-touch-id",
    script: async (page, click) => {
      await click(page.getByRole("button", { name: "Play" }));
      await page.getByRole("button", { name: "Waiting for your action" }).waitFor();
      await page.waitForTimeout(1200);
      await click(page.getByRole("button", { name: "Approve with Touch ID" }));
      await page.getByRole("button", { name: "Replay" }).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
    },
  },
  {
    file: "interactive-cancel.gif",
    demo: "figma-touch-id",
    script: async (page, click) => {
      await click(page.getByRole("button", { name: "Play" }));
      await page.getByRole("button", { name: "Waiting for your action" }).waitFor();
      await page.waitForTimeout(1200);
      // `exact` keeps this off the "If you cancel" button in the step list.
      await click(page.getByRole("button", { name: "Cancel", exact: true }));
      await page.getByRole("button", { name: "Replay" }).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
    },
  },
];

/** A visible cursor that follows Playwright's mouse, since headless browsers draw none. */
const CURSOR_SCRIPT = `
  addEventListener("DOMContentLoaded", () => {
    const cursor = document.createElement("div");
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.cssText = "position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;" +
      "background:rgb(15 23 42 / .35);border:2px solid #fff;box-shadow:0 1px 4px rgb(0 0 0 / .4);" +
      "pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px);transition:scale .12s,opacity .3s";
    document.body.append(cursor);
    let hide;
    addEventListener("mousemove", (e) => {
      clearTimeout(hide);
      cursor.style.opacity = "1";
      cursor.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    });
    addEventListener("mousedown", () => { cursor.style.scale = "0.75"; });
    addEventListener("mouseup", () => {
      cursor.style.scale = "1";
      // Fade out after a click, so the cursor isn't mistaken for part of the UI.
      hide = setTimeout(() => { cursor.style.opacity = "0"; }, 700);
    });
  });
`;

async function record(
  page: Page,
  baseUrl: string,
  recording: Recording,
): Promise<{ frames: Buffer[]; delays: number[]; height: number }> {
  // Record the minimal embed (terminal, app UI, and controls), as readers see it
  // in docs. The README supplies the context.
  await page.goto(`${baseUrl}?demo=${recording.demo}&embed=1&theme=${THEME}`);
  await page.getByRole("button", { name: "Play" }).waitFor();
  await page.mouse.move(40, 40);
  const walkthrough = page.locator(".cs-walkthrough");
  const box = (await walkthrough.boundingBox())!;
  // The walkthrough can grow while it plays (for example, when a tall window
  // appears), so capture down to the bottom of the viewport and crop later.
  const viewport = page.viewportSize()!;
  const clip = { x: box.x, y: box.y, width: Math.round(box.width), height: viewport.height - Math.round(box.y) };

  const frames: Buffer[] = [];
  const times: number[] = [];
  let height = 0;
  let recording_ = true;
  const capture = (async () => {
    while (recording_) {
      const started = Date.now();
      frames.push(await page.screenshot({ clip }));
      times.push(started);
      height = Math.max(height, Math.ceil((await walkthrough.boundingBox())!.height));
      await page.waitForTimeout(Math.max(0, FRAME_MS - (Date.now() - started)));
    }
  })();

  const click = async (target: Locator) => {
    const b = (await target.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
  };

  await recording.script(page, click);
  recording_ = false;
  await capture;
  const delays = times.map((t, i) => (times[i + 1] ?? t + FRAME_MS * 10) - t);
  if (height > clip.height) throw new Error(`${recording.file}: the walkthrough is taller than the viewport. Increase the viewport height.`);
  return { frames, delays, height };
}

/** Encode frames as a GIF, cropped to the top `height` rows. */
function encode(frames: Buffer[], delays: number[], height: number): Uint8Array {
  const images = frames.map((f) => {
    const png = PNG.sync.read(f);
    return { width: png.width, data: png.data.subarray(0, png.width * height * SCALE * 4) };
  });
  const { width } = images[0]!;
  const pixelHeight = height * SCALE;

  // One palette for the whole GIF, from a sample of frames, avoids flicker.
  // The last palette entry is reserved for "unchanged" pixels.
  // Sample every 4th pixel of about 16 frames spread across the recording,
  // so short-lived colors (highlights, badges) get palette entries too.
  const step = Math.max(1, Math.floor(images.length / 16));
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < images.length; i += step) {
    const data = images[i]!.data;
    const chunk = new Uint8Array(Math.ceil(data.length / 16) * 4);
    let o = 0;
    for (let p = 0; p < data.length; p += 16) chunk.set(data.subarray(p, p + 4), (o++) * 4);
    chunks.push(chunk.subarray(0, o * 4));
  }
  const colors = quantize(Buffer.concat(chunks), 255);
  const transparentIndex = colors.length;
  const palette = [...colors, [255, 0, 255]];

  const gif = GIFEncoder();
  let previous: Buffer | undefined;
  let pending: { index: Uint8Array; delay: number; first: boolean } | undefined;
  const flush = () => {
    if (!pending) return;
    gif.writeFrame(pending.index, width, pixelHeight, {
      palette,
      delay: pending.delay,
      // Keep the previous frame, and let unchanged pixels show through it.
      dispose: 1,
      ...(pending.first ? {} : { transparent: true, transparentIndex }),
    });
  };

  for (let i = 0; i < images.length; i++) {
    const data = images[i]!.data;
    // Merge frames that didn't change into one longer frame.
    if (previous && pending && data.equals(previous)) {
      pending.delay += delays[i]!;
      continue;
    }
    flush();
    const index = applyPalette(data, colors);
    if (previous) {
      // Store only the pixels that changed; the rest compress to almost nothing.
      for (let p = 0; p < index.length; p++) {
        const o = p * 4;
        if (data[o] === previous[o] && data[o + 1] === previous[o + 1] && data[o + 2] === previous[o + 2]) index[p] = transparentIndex;
      }
    }
    pending = { index, delay: delays[i]!, first: !previous };
    previous = data;
  }
  flush();
  gif.finish();
  return gif.bytes();
}

const server = await preview({ root, preview: { port: 4190, strictPort: true, open: false }, logLevel: "warn" });
const baseUrl = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch();
try {
  await mkdir(outDir, { recursive: true });
  const only = process.argv.slice(2).filter((arg) => arg.endsWith(".gif"));
  const unknown = only.filter((file) => !recordings.some((r) => r.file === file));
  if (unknown.length) throw new Error(`No recording named ${unknown.join(", ")}. Choose from ${recordings.map((r) => r.file).join(", ")}.`);
  for (const recording of recordings.filter((r) => only.length === 0 || only.includes(r.file))) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: SCALE, colorScheme: THEME });
    await page.addInitScript(CURSOR_SCRIPT);
    const { frames, delays, height } = await record(page, baseUrl, recording);
    const bytes = encode(frames, delays, height);
    await writeFile(path.join(outDir, recording.file), bytes);
    const seconds = (delays.reduce((a, b) => a + b, 0) / 1000).toFixed(1);
    console.log(`${recording.file}: ${frames.length} frames, ${seconds}s, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}
