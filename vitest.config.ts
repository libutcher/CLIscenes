import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so tests don't run the demo generator plugin.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
