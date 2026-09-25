import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react({})],
  test: { root: ".", include: ["test/**/*.test.ts", "test/**/*.test.tsx"], testTimeout: 30_000 },
});
