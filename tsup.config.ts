import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "anthropic/index": "src/anthropic/index.ts",
    "openai/index": "src/openai/index.ts",
    "google/index": "src/google/index.ts",
    "ollama/index": "src/ollama/index.ts",
    "openrouter/index": "src/openrouter/index.ts",
    "xai/index": "src/xai/index.ts",
    "http/index": "src/http/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  target: "esnext",
  outDir: "dist",
});
