/**
 * Figma links on image overlays. A link names one frame (or other layer) in a
 * Figma file. `cliscenes figma` uses it to download that layer into the
 * overlay's `src` file. Building a walkthrough never contacts Figma.
 */

export interface FigmaLink {
  /** The file key, or the branch key for a link to a branch. */
  fileKey: string;
  /** Node id in the API's form, such as "12:34". */
  nodeId: string;
}

/** Image formats Figma can export, keyed by the file extension of `src`. */
export const FIGMA_FORMATS = { ".svg": "svg", ".png": "png", ".jpg": "jpg", ".jpeg": "jpg" } as const;
export type FigmaFormat = (typeof FIGMA_FORMATS)[keyof typeof FIGMA_FORMATS];

/**
 * Read a link copied from Figma (select the layer, then Copy link to
 * selection). Returns undefined for anything that isn't a link to one layer.
 *
 *   https://www.figma.com/design/<file>/<name>?node-id=12-34
 *   https://www.figma.com/design/<file>/branch/<branch>/<name>?node-id=12-34
 *   https://www.figma.com/file/<file>/<name>?node-id=12%3A34
 */
export function parseFigmaLink(value: string): FigmaLink | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !/^(www\.)?figma\.com$/.test(url.hostname)) return undefined;

  const parts = url.pathname.split("/").filter(Boolean);
  if (!["design", "file", "proto"].includes(parts[0] ?? "")) return undefined;
  const fileKey = parts[2] === "branch" ? parts[3] : parts[1];
  if (!fileKey || !/^[A-Za-z0-9]+$/.test(fileKey)) return undefined;

  // Links use "12-34"; the API uses "12:34". Instance ids such as
  // "I12:34;56:78" follow the same rule.
  const nodeId = url.searchParams.get("node-id")?.replaceAll("-", ":");
  if (!nodeId || !/^I?\d+:\d+(;\d+:\d+)*$/.test(nodeId)) return undefined;

  return { fileKey, nodeId };
}

/**
 * Positions of named layers in a downloaded image, in the image's pixels at
 * 1×. `cliscenes figma` writes it next to the image; builds read it to place
 * click areas named by `layer`.
 */
export interface LayerPositions {
  width: number;
  height: number;
  layers: Record<string, { x: number; y: number; width: number; height: number }>;
}

/** Where the layer positions for an image are stored: x.svg → x.layers.json. */
export function layerPositionsPath(src: string): string {
  return src.replace(/\.[^./\\]+$/, "") + ".layers.json";
}

/** The export format for an image path, or undefined if Figma can't produce it. */
export function figmaFormat(src: string): FigmaFormat | undefined {
  const extension = src.slice(src.lastIndexOf(".")).toLowerCase();
  return FIGMA_FORMATS[extension as keyof typeof FIGMA_FORMATS];
}
