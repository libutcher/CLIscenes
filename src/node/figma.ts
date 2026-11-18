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
import {
  figmaFormat,
  layerPositionsPath,
  parseFigmaLink,
  type FigmaFormat,
  type FigmaLink,
  type LayerPositions,
} from "../core/figma.ts";
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
  /** Layer names that image actions point at. Their positions are saved too. */
  layers: string[];
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
        const layers = (overlay.actions ?? []).flatMap((a) => (a.layer ? [a.layer] : []));
        // The same frame used twice is downloaded once, with every layer either use names.
        const existing = images.find((i) => i.target === target);
        if (existing) {
          existing.layers = [...new Set([...existing.layers, ...layers])];
          continue;
        }
        images.push({ sourceFile, src: overlay.src, target, link, format, layers: [...new Set(layers)] });
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
    const nodeIds = [...new Set(group.map((i) => i.link.nodeId))];
    const urls = await renderUrls(fetch, token, fileKey, format, nodeIds);
    const withLayers = group.filter((i) => i.layers.length > 0);
    const nodes = withLayers.length
      ? await fetchNodes(fetch, token, fileKey, [...new Set(withLayers.map((i) => i.link.nodeId))])
      : {};
    for (const image of group) {
      const bytes = await download(fetch, urls[image.link.nodeId]!, image);
      let changed = await writeIfChanged(image.target, bytes);
      if (image.layers.length) {
        const positions = layerPositions(image, nodes[image.link.nodeId], bytes);
        const file = path.resolve(path.dirname(image.target), path.basename(layerPositionsPath(image.target)));
        changed = (await writeIfChanged(file, Buffer.from(JSON.stringify(positions, null, 2) + "\n"))) || changed;
      }
      results.push({ ...image, status: changed ? "updated" : "unchanged" });
    }
  }
  return results;
}

async function writeIfChanged(file: string, bytes: Buffer): Promise<boolean> {
  // checkTarget covers the folder; this also stops writing through a symlinked file.
  if (existsSync(file) && (await lstat(file)).isSymbolicLink()) {
    throw new FigmaError(`Won't write ${path.basename(file)}, because it's a symlink.`);
  }
  const current = existsSync(file) ? await readFile(file) : undefined;
  if (current?.equals(bytes)) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return true;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The parts of a Figma node this module reads. */
export interface FigmaNode {
  id: string;
  name: string;
  absoluteBoundingBox?: Box | null;
  absoluteRenderBounds?: Box | null;
  children?: FigmaNode[];
}

async function fetchNodes(
  fetch: typeof globalThis.fetch,
  token: string,
  fileKey: string,
  nodeIds: string[],
): Promise<Record<string, FigmaNode | undefined>> {
  const params = new URLSearchParams({ ids: nodeIds.join(",") });
  const response = await fetch(`${API}/files/${fileKey}/nodes?${params}`, { headers: { "X-Figma-Token": token } });
  if (!response.ok) throw new FigmaError(`File ${fileKey}: ${apiErrorReason(response.status)}`);
  const body = (await response.json()) as { err?: string | null; nodes?: Record<string, { document?: FigmaNode } | null> };
  if (body.err) throw new FigmaError(`File ${fileKey}: ${body.err}`);
  return Object.fromEntries(nodeIds.map((id) => [id, body.nodes?.[id]?.document]));
}

/**
 * Work out where each named layer sits in the downloaded image.
 *
 * Figma positions are absolute on the canvas, so they're measured from the
 * frame's corner. An export can be the size of the frame's box, or larger to
 * fit effects such as a drop shadow. Rather than assume, this matches the
 * image's real size against both and measures from whichever fits.
 */
export function layerPositions(image: FigmaImage, frame: FigmaNode | undefined, bytes: Buffer): LayerPositions {
  const where = `${path.basename(image.sourceFile)}: ${image.src}`;
  if (!frame) throw new FigmaError(`${where}: Figma didn't return the layers of node ${image.link.nodeId}.`);
  const size = imageSize(image.format, bytes);
  if (!size) throw new FigmaError(`${where}: couldn't read the exported image's size.`);

  const fits = (box?: Box | null) =>
    box && Math.abs(box.width - size.width) <= 1 && Math.abs(box.height - size.height) <= 1 ? box : undefined;
  const origin = fits(frame.absoluteBoundingBox) ?? fits(frame.absoluteRenderBounds);
  if (!origin) {
    throw new FigmaError(
      `${where}: the export is ${size.width}×${size.height}, which doesn't match the frame's size in Figma, so click areas can't be placed. Check the frame isn't rotated or scaled.`,
    );
  }

  const layers: LayerPositions["layers"] = {};
  for (const name of image.layers) {
    const matches = descendants(frame).filter((node) => node.name === name);
    if (matches.length === 0) {
      throw new FigmaError(`${where}: no layer named "${name}" inside the linked frame. Check the name in Figma (it's case-sensitive).`);
    }
    if (matches.length > 1) {
      throw new FigmaError(`${where}: ${matches.length} layers are named "${name}". Rename them so the one to click is unique.`);
    }
    const box = matches[0]!.absoluteBoundingBox;
    if (!box) throw new FigmaError(`${where}: layer "${name}" has no position. Is it hidden?`);
    layers[name] = {
      x: round2(box.x - origin.x),
      y: round2(box.y - origin.y),
      width: round2(box.width),
      height: round2(box.height),
    };
  }
  return { width: round2(size.width), height: round2(size.height), layers };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function descendants(node: FigmaNode): FigmaNode[] {
  return (node.children ?? []).flatMap((child) => [child, ...descendants(child)]);
}

/** The image's size in Figma's units (PNGs are exported at 2×). */
function imageSize(format: FigmaFormat, bytes: Buffer): { width: number; height: number } | undefined {
  if (format === "png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16) / 2, height: bytes.readUInt32BE(20) / 2 };
  }
  if (format === "svg") {
    const tag = /<svg\b[^>]*>/i.exec(bytes.toString("utf8"))?.[0];
    const attr = (name: string) => Number.parseFloat(new RegExp(`\\s${name}="([\\d.]+)(px)?"`).exec(tag ?? "")?.[1] ?? "");
    let width = attr("width");
    let height = attr("height");
    if (!(width > 0 && height > 0)) {
      const viewBox = /\sviewBox="([^"]+)"/.exec(tag ?? "")?.[1]?.trim().split(/[\s,]+/).map(Number);
      [width, height] = [viewBox?.[2] ?? NaN, viewBox?.[3] ?? NaN];
    }
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  return undefined;
}

function apiErrorReason(status: number): string {
  return status === 403
    ? "Figma refused the token. Check that FIGMA_TOKEN is current, has the file_content:read scope, and belongs to an account that can open the file."
    : status === 404
      ? "Figma couldn't find the file. Check the link, and that your account can open it."
      : status === 429
        ? "Figma is limiting requests. Wait a minute, then try again."
        : `Figma returned HTTP ${status}.`;
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
  if (!response.ok) throw new FigmaError(`File ${fileKey}: ${apiErrorReason(response.status)}`);
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
  // Nothing to download is not a token problem, so say so before asking for
  // a token: a walkthrough whose click areas come from a hand-written
  // positions file needs no link and no token at all.
  const images = await findFigmaImages(sourceDir);
  if (images.length === 0) return [NO_LINKS];
  if (dryRun) return images.map((i) => `would download  ${rel(i)}  (file ${i.link.fileKey}, node ${i.link.nodeId})`);

  const token = env.FIGMA_TOKEN?.trim();
  if (!token) {
    throw new FigmaError(
      "Set FIGMA_TOKEN to a Figma personal access token with the file_content:read scope.\n" +
        "Create one in Figma under Settings > Security > Personal access tokens. Keep it out of the repository.",
    );
  }
  const results = await syncFigmaImages({ sourceDir, token });
  return results.map((r) => `${r.status.padEnd(9)}  ${rel(r)}`);
}

const NO_LINKS =
  "No image overlays have a figma link, so there is nothing to download. Add `figma: <link>` to an image overlay to download its design.\n" +
  "Click areas placed by `layer` keep working without a link, as long as the image's .layers.json is there.";

function looksLike(format: FigmaFormat, bytes: Buffer): boolean {
  if (format === "png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (format === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  return /<svg\b/i.test(bytes.subarray(0, 4096).toString("utf8"));
}
