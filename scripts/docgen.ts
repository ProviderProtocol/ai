#!/usr/bin/env bun
/**
 * Auto-generates TypeDoc documentation based on package.json exports.
 *
 * This script reads the `exports` field from package.json and automatically
 * generates the --entryPoints arguments for TypeDoc. No manual maintenance needed.
 *
 * Usage: bun run scripts/docgen.ts
 */

import { $ } from "bun";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const pkg = await Bun.file(join(ROOT, "package.json")).json();

// Convert exports to entry points
// "." -> src/index.ts
// "./anthropic" -> src/anthropic/index.ts
const entryPoints = Object.keys(pkg.exports)
  .map(key => {
    if (key === ".") return "src/index.ts";
    // "./anthropic" -> "src/anthropic/index.ts"
    return `src${key.slice(1)}/index.ts`;
  })
  .filter(path => {
    // Verify the file exists
    const fullPath = join(ROOT, path);
    return Bun.file(fullPath).size > 0;
  });

console.log("Generating docs for entry points:");
entryPoints.forEach(ep => console.log(`  - ${ep}`));

// Build TypeDoc command
const args = [
  "typedoc",
  ...entryPoints.flatMap(ep => ["--entryPoints", ep]),
  "--out", "docs",
  "--plugin", "typedoc-plugin-markdown",
];

console.log("\nRunning:", args.join(" "));

// Run TypeDoc
await $`${args}`.cwd(ROOT);
