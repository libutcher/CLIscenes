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
import { demoSchema, formatIssues, type DemoSource } from "../core/schema.ts";
import { compileDemo, type CompileResult } from "../core/compile.ts";
import { parseCast } from "../core/asciicast.ts";
import type { DemoIndexEntry } from "../core/types.ts";

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
  assets: { from: string; to: string }[];
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

  const assets: GeneratedDemo["assets"] = [];
  const missing: string[] = [];
  const result = compileDemo(source, {
    id,
    rewriteAsset: (src) => {
      const sourceDir = path.dirname(sourceFile);
      const checked = resolveAsset(sourceDir, src);
      if ("problem" in checked) {
        missing.push(checked.problem);
        return src;
      }
      const existing = assets.find((a) => a.from === checked.real);
      if (existing) return existing.to;
      const to = assetOutputPath(sourceDir, checked.logical, new Set(assets.map((a) => a.to)));
      assets.push({ from: checked.real, to });
      return to;
    },
  });
  if (missing.length) throw new DemoSourceError(sourceFile, missing);

  // Self-check: the cast we produced must be a valid asciicast v3 file.
  parseCast(result.cast);
  parseCast(result.castReducedMotion);
  return { ...result, id, sourceFile, assets };
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
export function resolveAsset(sourceDir: string, src: string): { logical: string; real: string } | { problem: string } {
  const extension = path.extname(src).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) {
    return { problem: `Not an image file: ${src}. Use ${IMAGE_EXTENSIONS.join(", ")}.` };
  }
  const logical = path.resolve(sourceDir, src);
  if (!isInside(sourceDir, logical)) {
    return { problem: `Image must be inside the walkthrough's folder: ${src}` };
  }
  if (!existsSync(logical)) return { problem: `Image not found: ${src}` };
  const real = realpathSync(logical);
  if (!isInside(realpathSync(sourceDir), real)) {
    return { problem: `Image links to a file outside the walkthrough's folder: ${src}` };
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
export function assetOutputPath(sourceDir: string, from: string, taken: Set<string>): string {
  const relative = path.relative(sourceDir, from).split(path.sep).join("/");
  const preferred = `assets/${relative.replace(/^assets\//, "")}`;
  if (!taken.has(preferred)) return preferred;
  const hash = createHash("sha256").update(from).digest("hex").slice(0, 8);
  return `${path.posix.dirname(preferred)}/${hash}-${path.basename(from)}`;
}

export async function listSources(sourceDir: string): Promise<string[]> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name)))
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
      await copyFile(asset.from, target);
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
