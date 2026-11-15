/**
 * npm run generate          Validate demos/ and write generated/demos/
 * npm run validate          Validate only (no files written)
 */
import path from "node:path";
import { generateAll } from "../src/node/generate.ts";

const check = process.argv.includes("--check");
const root = path.resolve(import.meta.dirname, "..");

try {
  const demos = await generateAll({
    sourceDir: path.join(root, "demos"),
    outDir: path.join(root, "generated"),
    check,
  });
  for (const demo of demos) {
    const { steps, duration } = demo.manifest;
    const gates = steps.filter((s) => s.gate).length;
    console.log(
      `${check ? "valid" : "generated"}  ${demo.id}  (${steps.length} steps, ${gates} gated, ${duration.toFixed(1)}s)`,
    );
  }
  if (!check) console.log(`\nOutput: ${path.relative(process.cwd(), path.join(root, "generated", "demos")) || "."}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
