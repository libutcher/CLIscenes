/** Builds the `cliscenes` command into dist-lib/cli.js (run after the library build). */
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    ssr: "src/cli/cliscenes.ts",
    outDir: "dist-lib",
    emptyOutDir: false,
    target: "node20",
    rollupOptions: { output: { entryFileNames: "cli.js", banner: "#!/usr/bin/env node" } },
  },
});
