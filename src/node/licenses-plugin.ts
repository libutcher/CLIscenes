/**
 * Writes dist/THIRD_PARTY_LICENSES.txt with the license text of every runtime
 * package that may end up in the built player, so redistributing dist/ keeps
 * the required notices (asciinema-player is Apache-2.0).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Runtime dependencies and their dependencies (see `npm ls --omit=dev --all`). */
const BUNDLED = ["asciinema-player", "solid-js", "seroval", "seroval-plugins", "react", "react-dom", "scheduler"];

export function thirdPartyLicenses(): Plugin {
  return {
    name: "cliscenes-licenses",
    apply: "build",
    generateBundle() {
      const sections = BUNDLED.flatMap((name) => {
        const dir = path.resolve("node_modules", name);
        if (!existsSync(dir)) return [];
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
        const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
        const text = file ? readFileSync(path.join(dir, file), "utf8").trim() : `License: ${pkg.license}`;
        return [`${name}@${pkg.version} (${pkg.license})\n${"=".repeat(60)}\n\n${text}\n`];
      });
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_LICENSES.txt",
        source: `Third-party software included in this build of CLIscenes.\n\n${sections.join("\n\n")}`,
      });
    },
  };
}
