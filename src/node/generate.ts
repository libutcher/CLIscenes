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
import { existsSync } from "node:fs";
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
      const from = path.resolve(path.dirname(sourceFile), src);
      if (!existsSync(from)) missing.push(`Image not found: ${src}`);
      const to = `assets/${path.basename(src)}`;
      assets.push({ from, to });
      return to;
    },
  });
  if (missing.length) throw new DemoSourceError(sourceFile, missing);

  // Self-check: the cast we produced must be a valid asciicast v3 file.
  parseCast(result.cast);
  return { ...result, id, sourceFile, assets };
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
}

/**
 * Generate every demo in `sourceDir`. Validation errors from all files are
 * collected and thrown together, and nothing is written if any file fails.
 */
export async function generateAll({ sourceDir, outDir, check = false }: GenerateOptions): Promise<GeneratedDemo[]> {
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

  const demosDir = path.join(outDir, "demos");
  await rm(demosDir, { recursive: true, force: true });
  for (const demo of demos) {
    const dir = path.join(demosDir, demo.id);
    await mkdir(path.join(dir, "assets"), { recursive: true });
    await writeFile(path.join(dir, "demo.cast"), demo.cast);
    await writeFile(path.join(dir, "demo.json"), JSON.stringify(demo.manifest, null, 2) + "\n");
    for (const asset of demo.assets) await copyFile(asset.from, path.join(dir, asset.to));
  }
  const index: DemoIndexEntry[] = demos.map((d) => ({
    id: d.id,
    title: d.manifest.title,
    description: d.manifest.description,
  }));
  await writeFile(path.join(demosDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return demos;
}
