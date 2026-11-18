/**
 * Reads demo source files (YAML or JSON) and writes the static assets the
 * player needs:
 *
 *   generated/demos/index.json          list of demos
 *   generated/demos/<id>/demo.json      manifest (steps, gates, overlays)
 *   generated/demos/<id>/demo.cast      asciicast v3 recording
 *   generated/demos/<id>/assets/*       images referenced by overlays
 *
 * Commands in source files are never executed.
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { areaSchema, demoSchema, formatIssues, type DemoSource } from "../core/schema.ts";
import { compileDemo, type CompileResult } from "../core/compile.ts";
import { parseCast } from "../core/asciicast.ts";
import type { DemoIndexEntry } from "../core/types.ts";
import { layerPositionsPath, type LayerPositions } from "../core/figma.ts";

const SOURCE_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);

export class DemoSourceError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`${file}\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "DemoSourceError";
  }
}

/** Parse and validate source text. `file` is only used in error messages. */
export function parseDemoSource(text: string, file: string): DemoSource {
  let raw: unknown;
  try {
    raw = file.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    const message = error instanceof YAMLParseError || error instanceof SyntaxError ? error.message : String(error);
    throw new DemoSourceError(file, [`Could not parse file: ${message}`]);
  }
  const result = demoSchema.safeParse(raw);
  if (!result.success) throw new DemoSourceError(file, formatIssues(result.error));
  return result.data;
}

export interface GeneratedDemo extends CompileResult {
  id: string;
  sourceFile: string;
  assets: {
    from: string;
    /** The path as written in the walkthrough, for messages. */
    src: string;
    to: string;
    /** CSS file to add inside the SVG. */
    animation?: string;
    /** Build the copy for readers who ask for reduced motion. */
    reducedMotion?: boolean;
    /** The file to write, when it isn't a plain copy of `from`. */
    content?: string;
  }[];
}

/**
 * The stylesheet for the reduced-motion copy of an animated SVG. Browsers
 * don't reliably tell an image about the reader's motion setting, so the
 * player picks the copy instead, and in it every `prefers-reduced-motion`
 * query answers as if the reader asked for reduced motion. The feature is
 * swapped for one that is always true or always false for an image, so
 * queries that combine it with `not` or `and` keep their meaning.
 */
export function forceReducedMotion(css: string): string {
  const ALWAYS = "(min-width: 0px)";
  const NEVER = "(max-width: 0px)";
  return css.replace(/\(\s*prefers-reduced-motion\s*(?::\s*(no-preference|reduce)\s*)?\)/gi, (_, value?: string) =>
    value?.toLowerCase() === "no-preference" ? NEVER : ALWAYS,
  );
}

/**
 * Add a stylesheet inside an SVG, right after its opening tag. An SVG shown
 * with <img> still runs CSS animations, but can't load other files, so the
 * styles must be inside it.
 */
export function addSvgStyle(svg: string, css: string): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) throw new Error("the file doesn't contain an <svg> element.");
  if (css.includes("]]>")) throw new Error('the CSS file contains "]]>", which can\'t appear inside an SVG style.');
  const end = open.index + open[0].length;
  return `${svg.slice(0, end)}\n<style><![CDATA[\n${css.trim()}\n]]></style>${svg.slice(end)}`;
}

/** Compile a single source file in memory (no files are written). */
export async function buildDemo(sourceFile: string): Promise<GeneratedDemo> {
  const id = path.basename(sourceFile, path.extname(sourceFile));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new DemoSourceError(sourceFile, [
      `File name "${id}" is used as the demo id. Use lowercase letters, numbers, and hyphens.`,
    ]);
  }
  const source = parseDemoSource(await readFile(sourceFile, "utf8"), sourceFile);
  const layerProblems = await resolveLayerAreas(source, path.dirname(sourceFile));
  if (layerProblems.length) throw new DemoSourceError(sourceFile, layerProblems);

  const assets: GeneratedDemo["assets"] = [];
  // A Set, because an animated image is checked for both of its copies.
  const missing = new Set<string>();
  const sourceDir = path.dirname(sourceFile);
  const result = compileDemo(source, {
    id,
    rewriteAsset: (src, options) => {
      const checked = resolveAsset(sourceDir, src);
      if ("problem" in checked) {
        missing.add(checked.problem);
        return src;
      }
      let animation: string | undefined;
      if (options?.animation) {
        const css = resolveAsset(sourceDir, options.animation, [".css"]);
        if ("problem" in css) {
          missing.add(css.problem);
          return src;
        }
        animation = css.real;
      }
      const reducedMotion = Boolean(animation && options?.reducedMotion);
      const existing = assets.find(
        (a) => a.from === checked.real && a.animation === animation && Boolean(a.reducedMotion) === reducedMotion,
      );
      if (existing) return existing.to;
      // The reduced-motion copy sits next to the image: x.svg → x.reduced-motion.svg.
      const logical = reducedMotion ? checked.logical.replace(/(\.[^./\\]+)$/, ".reduced-motion$1") : checked.logical;
      const variant = animation ? `${animation}${reducedMotion ? "\0reduced" : ""}` : "";
      const to = assetOutputPath(sourceDir, logical, new Set(assets.map((a) => a.to)), variant);
      assets.push({ from: checked.real, src, to, ...(animation ? { animation } : {}), ...(reducedMotion ? { reducedMotion } : {}) });
      return to;
    },
  });
  if (missing.size) throw new DemoSourceError(sourceFile, [...missing]);

  // Build animated SVGs now, so validation reports a bad SVG or CSS file.
  for (const asset of assets) {
    if (!asset.animation) continue;
    try {
      const css = await readFile(asset.animation, "utf8");
      asset.content = addSvgStyle(await readFile(asset.from, "utf8"), asset.reducedMotion ? forceReducedMotion(css) : css);
    } catch (error) {
      missing.add(`Could not add animation to ${asset.src}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (missing.size) throw new DemoSourceError(sourceFile, [...missing]);

  // Self-check: the cast we produced must be a valid asciicast v3 file.
  parseCast(result.cast);
  parseCast(result.castReducedMotion);
  return { ...result, id, sourceFile, assets };
}

/**
 * Replace each image action's `layer` with an `area`, using the positions
 * stored next to the image. `cliscenes figma` writes that file from a Figma
 * frame, and it can also be written by hand. Returns problems.
 */
async function resolveLayerAreas(source: DemoSource, sourceDir: string): Promise<string[]> {
  const problems: string[] = [];
  const cache = new Map<string, LayerPositions | string>();
  for (const step of source.steps) {
    for (const overlay of step.overlays ?? (step.overlay ? [step.overlay] : [])) {
      if (overlay.type !== "image" || !overlay.actions?.some((a) => a.layer)) continue;
      const file = layerPositionsPath(overlay.src);
      if (!cache.has(file)) cache.set(file, await readLayerPositions(sourceDir, file, overlay.src));
      const positions = cache.get(file)!;
      for (const action of overlay.actions) {
        if (!action.layer) continue;
        if (typeof positions === "string") {
          problems.push(positions);
          continue;
        }
        const box = positions.layers[action.layer];
        if (!box) {
          problems.push(
            `No layer named "${action.layer}" in ${file}. Check the name (it's case-sensitive), then run cliscenes figma again or add the layer to ${path.basename(file)}.`,
          );
          continue;
        }
        // Percentages, checked by the same schema as a hand-written `area`,
        // so a box that is off the image or has no size is reported here
        // rather than becoming a button the reader can't click.
        const pct = (value: number, total: number) => `${Math.round((value / total) * 100_000) / 1000}%`;
        const area = areaSchema.safeParse({
          x: pct(box.x, positions.width),
          y: pct(box.y, positions.height),
          width: pct(box.width, positions.width),
          height: pct(box.height, positions.height),
        });
        if (!area.success) {
          problems.push(`Layer "${action.layer}" in ${file} isn't a usable click area: ${area.error.issues[0]!.message}`);
          continue;
        }
        action.area = area.data;
        delete action.layer;
      }
    }
  }
  return [...new Set(problems)];
}

/** Read an image's layer positions, or return a problem to report. */
async function readLayerPositions(sourceDir: string, file: string, src: string): Promise<LayerPositions | string> {
  const checked = resolveAsset(sourceDir, file, [".json"]);
  if ("problem" in checked) {
    return `No click-area positions for ${src} (${file}). Run cliscenes figma (npm run figma) to download them, or write ${path.basename(file)} by hand.`;
  }
  const size = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  try {
    const data = JSON.parse(await readFile(checked.real, "utf8")) as LayerPositions;
    if (!(size(data.width) && size(data.height) && data.layers && typeof data.layers === "object")) throw new Error("bad shape");
    // Every box is measured in the image's own pixels. A hand-written file is
    // easy to mistype, so check each one rather than trusting it.
    for (const box of Object.values(data.layers)) {
      const fields = [box?.x, box?.y, box?.width, box?.height];
      if (!fields.every((value) => typeof value === "number" && Number.isFinite(value))) throw new Error("bad box");
    }
    return data;
  } catch {
    return `${file} isn't a layer positions file. It needs a positive width and height, and a layers object whose entries each have a numeric x, y, width, and height. Run cliscenes figma again, or fix the file by hand.`;
  }
}

/** File types an overlay may reference. Anything else is refused. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];

const isInside = (dir: string, file: string) => {
  const relative = path.relative(dir, file);
  return relative !== "" && relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative);
};

/**
 * Check a referenced file before it's copied into published output. It must
 * be an image, and both its path and its real location (after following
 * symlinks) must be inside the walkthrough's folder. This keeps a source file
 * from publishing anything else on the machine, such as a key or a .env file.
 */
export function resolveAsset(
  sourceDir: string,
  src: string,
  extensions: readonly string[] = IMAGE_EXTENSIONS,
): { logical: string; real: string } | { problem: string } {
  const kind = extensions === IMAGE_EXTENSIONS ? "Image" : "File";
  const extension = path.extname(src).toLowerCase();
  if (!extensions.includes(extension)) {
    const expected = extensions === IMAGE_EXTENSIONS ? "an image file" : `a ${extensions.join(" or ")} file`;
    return { problem: `Not ${expected}: ${src}. Use ${extensions.join(", ")}.` };
  }
  const logical = path.resolve(sourceDir, src);
  if (!isInside(sourceDir, logical)) {
    return { problem: `${kind} must be inside the walkthrough's folder: ${src}` };
  }
  if (!existsSync(logical)) return { problem: `${kind} not found: ${src}` };
  const real = realpathSync(logical);
  if (!isInside(realpathSync(sourceDir), real)) {
    return { problem: `${kind} links to a file outside the walkthrough's folder: ${src}` };
  }
  if (!statSync(real).isFile()) return { problem: `Not a file: ${src}` };
  return { logical, real };
}

/**
 * Where a referenced file goes in the output. Files keep their path relative
 * to the source file (a leading `assets/` is not repeated), so same-named
 * files in different folders stay apart. If the preferred path is already
 * taken by a different file, a short hash of the file's location is added.
 */
export function assetOutputPath(sourceDir: string, from: string, taken: Set<string>, variant = ""): string {
  const relative = path.relative(sourceDir, from).split(path.sep).join("/");
  const preferred = `assets/${relative.replace(/^assets\//, "")}`;
  if (!taken.has(preferred)) return preferred;
  // `variant` keeps one image with and without an animation apart.
  const hash = createHash("sha256").update(from + "\0" + variant).digest("hex").slice(0, 8);
  return `${path.posix.dirname(preferred)}/${hash}-${path.basename(from)}`;
}

export async function listSources(sourceDir: string): Promise<string[]> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  return entries
    // Layer positions saved by `cliscenes figma` are JSON too, but not walkthroughs.
    .filter((e) => e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name)) && !e.name.endsWith(".layers.json"))
    .map((e) => path.join(sourceDir, e.name))
    .sort();
}

export interface GenerateOptions {
  sourceDir: string;
  outDir: string;
  /** Validate and compile only; write nothing. */
  check?: boolean;
  /**
   * Write walkthroughs straight into `outDir` (`outDir/<id>/demo.json`)
   * instead of `outDir/demos/`. Used by the `cliscenes build` command.
   * The folder is replaced on each run, so it must be empty or one that
   * CLIscenes created before (it leaves a marker file).
   */
  flat?: boolean;
}

/** Marks a folder that `cliscenes build` owns and may replace. */
export const OUTPUT_MARKER = ".cliscenes-output";

async function prepareFlatOutput(outDir: string): Promise<void> {
  if (!existsSync(outDir)) return;
  const entries = await readdir(outDir);
  if (entries.length === 0 || entries.includes(OUTPUT_MARKER)) {
    await rm(outDir, { recursive: true, force: true });
    return;
  }
  throw new Error(
    `${outDir} isn't empty, and CLIscenes didn't create it. Choose a dedicated folder, such as static/walkthroughs, so nothing else gets replaced.`,
  );
}

/**
 * Generate every demo in `sourceDir`. Validation errors from all files are
 * collected and thrown together, and nothing is written if any file fails.
 */
export async function generateAll({ sourceDir, outDir, check = false, flat = false }: GenerateOptions): Promise<GeneratedDemo[]> {
  const sources = await listSources(sourceDir);
  if (sources.length === 0) throw new Error(`No .yaml, .yml, or .json files found in ${sourceDir}.`);

  const demos: GeneratedDemo[] = [];
  const errors: DemoSourceError[] = [];
  for (const file of sources) {
    try {
      demos.push(await buildDemo(file));
    } catch (error) {
      if (error instanceof DemoSourceError) errors.push(error);
      else throw error;
    }
  }
  const ids = new Set<string>();
  for (const demo of demos) {
    if (ids.has(demo.id)) errors.push(new DemoSourceError(demo.sourceFile, [`Another file also produces demo id "${demo.id}".`]));
    ids.add(demo.id);
  }
  if (errors.length) throw new AggregateError(errors, errors.map((e) => e.message).join("\n\n"));
  if (check) return demos;

  const demosDir = flat ? outDir : path.join(outDir, "demos");
  if (flat) {
    await prepareFlatOutput(outDir);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, OUTPUT_MARKER), "Generated by CLIscenes. This folder is replaced on each build.\n");
  } else {
    await rm(demosDir, { recursive: true, force: true });
  }
  for (const demo of demos) {
    const dir = path.join(demosDir, demo.id);
    await mkdir(path.join(dir, "assets"), { recursive: true });
    await writeFile(path.join(dir, "demo.cast"), demo.cast);
    await writeFile(path.join(dir, "demo.reduced-motion.cast"), demo.castReducedMotion);
    await writeFile(path.join(dir, "demo.json"), JSON.stringify(demo.manifest, null, 2) + "\n");
    for (const asset of demo.assets) {
      const target = path.join(dir, asset.to);
      await mkdir(path.dirname(target), { recursive: true });
      if (asset.content !== undefined) await writeFile(target, asset.content);
      else await copyFile(asset.from, target);
    }
  }
  const index: DemoIndexEntry[] = demos.map((d) => ({
    id: d.id,
    title: d.manifest.title,
    description: d.manifest.description,
  }));
  await writeFile(path.join(demosDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return demos;
}
