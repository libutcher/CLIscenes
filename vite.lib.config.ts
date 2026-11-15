/**
 * Library build: `npm run build:lib` writes dist-lib/ with
 *   react.js       <CLIscene> and <Walkthrough> for any React app
 *   docusaurus.js  a Docusaurus component (imports the styles itself)
 *   style.css      all player styles, scoped to .cs-walkthrough
 * React and asciinema-player stay external; the host's bundler provides them.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: { react: "src/lib/react.ts", docusaurus: "src/lib/docusaurus.tsx" },
      formats: ["es"],
      cssFileName: "style",
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^asciinema-player$/, /^@docusaurus\//, "cliscenes/style.css"],
    },
  },
});
