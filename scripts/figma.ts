/**
 * npm run figma               Download linked Figma frames into demos/
 * npm run figma -- --dry-run  List the links without downloading
 *
 * Needs FIGMA_TOKEN (a personal access token with file_content:read).
 */
import path from "node:path";
import { runFigmaCommand } from "../src/node/figma.ts";

const root = path.resolve(import.meta.dirname, "..");

try {
  const lines = await runFigmaCommand(path.join(root, "demos"), { dryRun: process.argv.includes("--dry-run") });
  for (const line of lines) console.log(line);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
