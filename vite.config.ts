import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cliscenes } from "./src/node/vite-plugin.ts";
import { thirdPartyLicenses } from "./src/node/licenses-plugin.ts";

export default defineConfig({
  // Relative asset URLs let the built player run from any folder or subpath.
  base: "./",
  // Generated demos (cast files, manifests, images) are served as static files.
  publicDir: "generated",
  plugins: [react(), cliscenes({ sourceDir: "demos", outDir: "generated" }), thirdPartyLicenses()],
  build: {
    rollupOptions: {
      input: {
        player: "index.html",
        embed: "embed-example.html",
      },
    },
  },
});
