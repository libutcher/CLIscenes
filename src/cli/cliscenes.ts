/**
 * The `cliscenes` command, for using CLIscenes from another project.
 *
 *   cliscenes build <source-dir> --out <dir>   Generate walkthroughs into <dir>
 *   cliscenes validate <source-dir>            Check sources without writing
 *
 * For a Docusaurus site:  cliscenes build walkthroughs --out static/walkthroughs
 */
import path from "node:path";
import { generateAll } from "../node/generate.ts";

const USAGE = `Usage:
  cliscenes build <source-dir> --out <dir>   Generate walkthroughs into <dir>
  cliscenes validate <source-dir>            Check walkthrough files without writing anything

Example (Docusaurus):
  cliscenes build walkthroughs --out static/walkthroughs`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

async function main(argv: string[]) {
  const [command, sourceArg, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }
  if (command !== "build" && command !== "validate") fail(`Unknown command "${command}".`);
  if (!sourceArg) fail("Missing <source-dir>.");

  const sourceDir = path.resolve(sourceArg);
  const outIndex = rest.indexOf("--out");
  const outArg = outIndex === -1 ? undefined : rest[outIndex + 1];
  if (command === "build" && !outArg) fail("Missing --out <dir>.");

  const demos = await generateAll({
    sourceDir,
    outDir: outArg ? path.resolve(outArg) : sourceDir,
    check: command === "validate",
    flat: true,
  });
  for (const demo of demos) {
    const { steps, duration } = demo.manifest;
    const gates = steps.filter((s) => s.gate).length;
    console.log(`${command === "validate" ? "valid" : "built"}  ${demo.id}  (${steps.length} steps, ${gates} gated, ${duration.toFixed(1)}s)`);
  }
  if (command === "build") console.log(`\nWrote ${demos.length} walkthrough${demos.length === 1 ? "" : "s"} to ${path.relative(process.cwd(), path.resolve(outArg!)) || "."}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
