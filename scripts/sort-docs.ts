#!/usr/bin/env bun
/**
 * @fileoverview Sorts and transforms typedoc-generated markdown for Starlight docs.
 *
 * This script:
 * 1. Renames @providerprotocol/ai -> core
 * 2. Lowercases all file/folder names
 * 3. Renames README.md -> index.md
 * 4. Adds Starlight frontmatter
 * 5. Fixes internal links
 *
 * Usage:
 *   bun run scripts/sort-docs.ts [--output <path>]
 *
 * Options:
 *   --output, -o  Output directory (default: ./docs-sorted)
 */

import { readdir, readFile, writeFile, mkdir, rm, stat } from "fs/promises";
import { join, dirname, basename } from "path";
import { parseArgs } from "util";

const DOCS_DIR = join(import.meta.dirname, "../docs");

// Parse CLI args
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    output: { type: "string", short: "o", default: join(import.meta.dirname, "../docs-sorted") },
  },
});

const OUTPUT_DIR = values.output ?? join(import.meta.dirname, "../docs-sorted");

interface FileMapping {
  oldPath: string;
  newPath: string;
}

const fileMappings: FileMapping[] = [];

/**
 * Transform a path according to our rules:
 * - @providerprotocol/ai -> core
 * - README.md -> index.md
 * - Lowercase everything
 */
function transformPath(relativePath: string): string {
  return relativePath
    .replace(/@providerprotocol\/ai/g, "core")
    .replace(/README\.md$/i, "index.md")
    .split("/")
    .map((segment) => {
      if (segment.endsWith(".md")) {
        return segment.toLowerCase();
      }
      return segment.toLowerCase();
    })
    .join("/");
}

/**
 * Sanitize title for YAML frontmatter
 * - Remove backslash escapes (typedoc uses \< for angle brackets)
 * - Remove generic type parameters for cleaner titles
 */
function sanitizeTitle(title: string): string {
  return title
    // Remove backslash escapes
    .replace(/\\([<>])/g, "$1")
    // Remove generic type parameters like <T, U> or <TParams, TOptions>
    .replace(/<[^>]+>/g, "")
    // Clean up double spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract title from markdown content or filename
 */
function extractTitle(content: string, filename: string): string {
  // Try to find first h1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match && h1Match[1]) {
    return sanitizeTitle(h1Match[1].trim());
  }

  // Fall back to filename without extension
  const name = basename(filename, ".md");
  if (name.toLowerCase() === "index" || name.toLowerCase() === "readme") {
    return "@providerprotocol/ai";
  }
  return name;
}

/**
 * Add Starlight frontmatter to markdown content
 */
function addFrontmatter(content: string, filename: string): string {
  // Check if frontmatter already exists
  if (content.startsWith("---")) {
    return content;
  }

  const title = extractTitle(content, filename);

  return `---
title: "${title}"
---

${content}`;
}

/**
 * Fix internal links to match new structure
 */
function fixLinks(content: string): string {
  // Fix relative links
  return content
    // Fix @providerprotocol/ai references in links
    .replace(/\]\(([^)]*@providerprotocol\/ai[^)]*)\)/g, (_, link) => {
      const newLink = link.replace(/@providerprotocol\/ai/g, "core");
      return `](${newLink})`;
    })
    // Fix README.md -> index.md in links
    .replace(/\]\(([^)]*)(README\.md)([^)]*)\)/gi, (_, prefix, _readme, suffix) => {
      return `](${prefix}index.md${suffix})`;
    })
    // Lowercase .md file references in links
    .replace(/\]\(([^)]+\.md[^)]*)\)/gi, (_, link) => {
      // Split on .md to preserve anchors
      const parts = link.split(".md");
      const pathPart = parts[0];
      const rest = parts.slice(1).join(".md");

      // Lowercase each path segment
      const lowercasedPath = pathPart
        .split("/")
        .map((seg: string) => seg.toLowerCase())
        .join("/");

      return `](${lowercasedPath}.md${rest})`;
    })
    // Fix modules.md -> remove or redirect to index
    .replace(/\]\([^)]*modules\.md[^)]*\)/g, "](./index.md)");
}

/**
 * Recursively process directory
 */
async function processDirectory(dir: string, relativePath: string = ""): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const entryRelativePath = join(relativePath, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(fullPath, entryRelativePath);
    } else if (entry.name.endsWith(".md")) {
      // Skip modules.md as it's just an index
      if (entry.name === "modules.md") {
        continue;
      }

      const newRelativePath = transformPath(entryRelativePath);
      const newFullPath = join(OUTPUT_DIR, newRelativePath);

      fileMappings.push({
        oldPath: entryRelativePath,
        newPath: newRelativePath,
      });

      // Read content
      let content = await readFile(fullPath, "utf-8");

      // Fix links
      content = fixLinks(content);

      // Add frontmatter
      content = addFrontmatter(content, entry.name);

      // Ensure directory exists
      await mkdir(dirname(newFullPath), { recursive: true });

      // Write file
      await writeFile(newFullPath, content);
    }
  }
}

async function main() {
  console.log("Sorting docs from:", DOCS_DIR);
  console.log("Output directory:", OUTPUT_DIR);

  // Check if docs directory exists
  try {
    await stat(DOCS_DIR);
  } catch {
    console.error("Error: docs directory not found. Run 'bun run docgen' first.");
    process.exit(1);
  }

  // Clean output directory
  try {
    await rm(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory doesn't exist, that's fine
  }
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Process all files
  await processDirectory(DOCS_DIR);

  console.log(`\nProcessed ${fileMappings.length} files:`);

  // Group by directory for summary
  const dirs = new Map<string, number>();
  for (const mapping of fileMappings) {
    const dir = dirname(mapping.newPath);
    dirs.set(dir, (dirs.get(dir) || 0) + 1);
  }

  for (const [dir, count] of Array.from(dirs.entries()).sort()) {
    console.log(`  ${dir}: ${count} files`);
  }

  console.log("\nDocs sorted successfully!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
