/**
 * Downloads images from Figma into walkthrough folders.
 *
 * An image overlay with a `figma` link names a frame. This module asks the
 * Figma REST API to render each frame in the format that `src` asks for, then
 * writes the result to `src`. It is the only part of CLIscenes that uses the
 * network, and it runs only when someone runs `cliscenes figma`: building a
 * walkthrough reads the file already in the folder.
 */
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { figmaFormat, parseFigmaLink, type FigmaFormat, type FigmaLink } from "../core/figma.ts";
import { DemoSourceError, listSources, parseDemoSource } from "./generate.ts";

const API = "https://api.figma.com/v1";
/** Larger than any reasonable dialog export; stops a bad response filling the disk. */
const MAX_BYTES = 20 * 1024 * 1024;

export interface FigmaImage {
  /** The walkthrough file that links to the frame. */
  sourceFile: string;
  /** `src` as written in the walkthrough. */
  src: string;
  /** Absolute path the image is written to. */
  target: string;
  link: FigmaLink;
  format: FigmaFormat;
}

export type FigmaSyncResult = FigmaImage & { status: "updated" | "unchanged" };

export interface FigmaSyncOptions {
  sourceDir: string;
  /** A Figma personal access token with the file_content:read scope. */
  token: string;
  /** Defaults to the global fetch. Tests pass their own. */
  fetch?: typeof globalThis.fetch;
}

export class FigmaError extends Error {
  override name = "FigmaError";
}

/** Every image overlay in `sourceDir` that has a `figma` link. */
export async function findFigmaImages(sourceDir: string): Promise<FigmaImage[]> {
  const images: FigmaImage[] = [];
  const errors: DemoSourceError[] = [];
  for (const sourceFile of await listSources(sourceDir)) {
    let source;
    try {
      source = parseDemoSource(await readFile(sourceFile, "utf8"), sourceFile);
    } catch (error) {
      if (error instanceof DemoSourceError) {
        errors.push(error);
        continue;
      }
      throw error;
    }
    for (const step of source.steps) {
      for (const overlay of step.overlays ?? (step.overlay ? [step.overlay] : [])) {
        if (overlay.type !== "image" || !overlay.figma) continue;
        // The schema has already checked both of these.
        const link = parseFigmaLink(overlay.figma)!;
        const format = figmaFormat(overlay.src)!;
        const target = path.resolve(path.dirname(sourceFile), overlay.src);
        // The same frame used twice is downloaded once.
        if (images.some((i) => i.target === target)) continue;
        images.push({ sourceFile, src: overlay.src, target, link, format });
      }
    }
  }
  if (errors.length) throw new AggregateError(errors, errors.map((e) => e.message).join("\n\n"));
  return images;
}

/** Download every linked frame and write the ones that changed. */
export async function syncFigmaImages({ sourceDir, token, fetch = globalThis.fetch }: FigmaSyncOptions): Promise<FigmaSyncResult[]> {
  const images = await findFigmaImages(sourceDir);
  for (const image of images) await checkTarget(sourceDir, image);

  // One API call per file and format renders all of its frames together.
  const groups = new Map<string, FigmaImage[]>();
  for (const image of images) {
    const key = `${image.link.fileKey} ${image.format}`;
    groups.set(key, [...(groups.get(key) ?? []), image]);
  }

  const results: FigmaSyncResult[] = [];
  for (const group of groups.values()) {
    const { fileKey } = group[0]!.link;
    const format = group[0]!.format;
    const urls = await renderUrls(fetch, token, fileKey, format, [...new Set(group.map((i) => i.link.nodeId))]);
    for (const image of group) {
      const bytes = await download(fetch, urls[image.link.nodeId]!, image);
      const current = existsSync(image.target) ? await readFile(image.target) : undefined;
      if (current?.equals(bytes)) {
        results.push({ ...image, status: "unchanged" });
        continue;
      }
      await mkdir(path.dirname(image.target), { recursive: true });
      await writeFile(image.target, bytes);
      results.push({ ...image, status: "updated" });
    }
  }
  return results;
}

/**
 * Refuse to write outside the walkthrough's folder. The schema already rules
 * out ".." and absolute paths; this also catches symlinks.
 */
async function checkTarget(sourceDir: string, image: FigmaImage) {
  const root = realpathSync(sourceDir);
  let dir = path.dirname(image.target);
  while (!existsSync(dir)) dir = path.dirname(dir);
  const realDir = realpathSync(dir);
  const inside = realDir === root || realDir.startsWith(root + path.sep);
  const isLink = existsSync(image.target) && (await lstat(image.target)).isSymbolicLink();
  if (!inside || isLink) {
    throw new FigmaError(`${path.relative(sourceDir, image.sourceFile)}: won't write ${image.src}, because it points outside the walkthrough's folder.`);
  }
}

async function renderUrls(
  fetch: typeof globalThis.fetch,
  token: string,
  fileKey: string,
  format: FigmaFormat,
  nodeIds: string[],
): Promise<Record<string, string>> {
  const params = new URLSearchParams({ ids: nodeIds.join(","), format });
  if (format === "svg") {
    // Text as outlines, because an SVG shown with <img> can't load web fonts.
    // Layer names as ids, so an animation stylesheet can target them.
    params.set("svg_outline_text", "true");
    params.set("svg_include_id", "true");
  } else {
    params.set("scale", "2");
  }

  const response = await fetch(`${API}/images/${fileKey}?${params}`, { headers: { "X-Figma-Token": token } });
  if (!response.ok) {
    const reason =
      response.status === 403
        ? "Figma refused the token. Check that FIGMA_TOKEN is current, has the file_content:read scope, and belongs to an account that can open the file."
        : response.status === 404
          ? "Figma couldn't find the file. Check the link, and that your account can open it."
          : response.status === 429
            ? "Figma is limiting requests. Wait a minute, then try again."
            : `Figma returned HTTP ${response.status}.`;
    throw new FigmaError(`File ${fileKey}: ${reason}`);
  }
  const body = (await response.json()) as { err?: string | null; images?: Record<string, string | null> };
  if (body.err) throw new FigmaError(`File ${fileKey}: ${body.err}`);

  const urls: Record<string, string> = {};
  for (const nodeId of nodeIds) {
    const url = body.images?.[nodeId];
    if (!url) {
      throw new FigmaError(
        `File ${fileKey}: Figma couldn't render node ${nodeId}. It may have been deleted, or be hidden or empty.`,
      );
    }
    urls[nodeId] = url;
  }
  return urls;
}

/** Fetch a rendered image. The token isn't sent: these are signed URLs. */
async function download(fetch: typeof globalThis.fetch, url: string, image: FigmaImage): Promise<Buffer> {
  const where = `${path.basename(image.sourceFile)}: ${image.src}`;
  if (!url.startsWith("https://")) throw new FigmaError(`${where}: Figma returned an unexpected image URL.`);
  const response = await fetch(url);
  if (!response.ok) throw new FigmaError(`${where}: downloading the export failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new FigmaError(`${where}: the export is larger than 20 MB.`);
  if (!looksLike(image.format, bytes)) throw new FigmaError(`${where}: the download isn't a ${image.format.toUpperCase()} file.`);
  return bytes;
}

/**
 * The `figma` command shared by `npm run figma` and `cliscenes figma`.
 * Returns the lines to print. `--dry-run` lists links without a token.
 */
export async function runFigmaCommand(sourceDir: string, { dryRun = false, env = process.env } = {}): Promise<string[]> {
  const rel = (image: FigmaImage) => path.relative(process.cwd(), image.target);
  if (dryRun) {
    const images = await findFigmaImages(sourceDir);
    if (images.length === 0) return [NO_LINKS];
    return images.map((i) => `would download  ${rel(i)}  (file ${i.link.fileKey}, node ${i.link.nodeId})`);
  }
  const token = env.FIGMA_TOKEN?.trim();
  if (!token) {
    throw new FigmaError(
      "Set FIGMA_TOKEN to a Figma personal access token with the file_content:read scope.\n" +
        "Create one in Figma under Settings > Security > Personal access tokens. Keep it out of the repository.",
    );
  }
  const results = await syncFigmaImages({ sourceDir, token });
  if (results.length === 0) return [NO_LINKS];
  return results.map((r) => `${r.status.padEnd(9)}  ${rel(r)}`);
}

const NO_LINKS = "No image overlays have a figma link. Add `figma: <link>` to an image overlay first.";

function looksLike(format: FigmaFormat, bytes: Buffer): boolean {
  if (format === "png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (format === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  return /<svg\b/i.test(bytes.subarray(0, 4096).toString("utf8"));
}
