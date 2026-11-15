/**
 * Vite plugin: generates demos when the dev server or a build starts, and
 * regenerates (then reloads the browser) whenever a source file changes.
 */
import path from "node:path";
import type { Plugin } from "vite";
import { generateAll } from "./generate.ts";

export function cliscenes(options: { sourceDir: string; outDir: string }): Plugin {
  let root = process.cwd();
  const sourceDir = () => path.resolve(root, options.sourceDir);
  const outDir = () => path.resolve(root, options.outDir);

  const run = async () => {
    const demos = await generateAll({ sourceDir: sourceDir(), outDir: outDir() });
    return demos.map((d) => d.id).join(", ");
  };

  return {
    name: "cliscenes",
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      const ids = await run();
      this.info(`generated demos: ${ids}`);
    },
    configureServer(server) {
      server.watcher.add(sourceDir());
      const onChange = async (file: string) => {
        if (!path.resolve(file).startsWith(sourceDir() + path.sep)) return;
        try {
          const ids = await run();
          server.config.logger.info(`[cliscenes] regenerated: ${ids}`, { timestamp: true });
          server.ws.send({ type: "full-reload" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.config.logger.error(`[cliscenes] ${message}`, { timestamp: true });
          server.ws.send({ type: "error", err: { message, stack: "", plugin: "cliscenes" } });
        }
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}
