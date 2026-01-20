---
name: readme-updater
description: Update and reorganize README documentation based on codebase changes. Use when adding features, refactoring modules, updating APIs, or when documentation drifts from implementation.
allowed-tools: Read, Grep, Glob, Bash(git:*)
context: fork
---

# README Updater

> Analyze codebase changes and intelligently update README documentation to reflect current implementation.

## When to Use

- After implementing new features or modules
- When APIs or interfaces have changed
- Before releases to ensure docs match code
- When documentation has drifted from implementation
- User says "update readme", "sync docs", "readme is stale"

## Instructions

### Step 1: Determine Change Scope

Identify what has changed since README was last accurate:

```bash
# Find when README was last modified
git log -1 --format="%h %s" -- README.md

# Get commits since README update
git log $(git log -1 --format="%h" -- README.md)..HEAD --oneline --no-merges

# See what files changed
git diff --name-only $(git log -1 --format="%h" -- README.md)..HEAD
```

### Step 2: Spawn Analysis Sub-Agents

Deploy parallel sub-agents to analyze different aspects:

| Sub-Agent | Task |
|-----------|------|
| **Structure Analyzer** | Review current README structure, identify sections, assess organization |
| **Codebase Scanner** | Scan exports, public APIs, module structure, entry points |
| **Change Detector** | Compare README claims against current implementation |
| **Example Validator** | Verify code examples still compile/work |

**Prompt each sub-agent with:**
> "Analyze [scope] and report findings relevant to README accuracy. Focus on public-facing APIs, usage patterns, and installation/setup procedures."

### Step 3: Synthesize Findings

Aggregate sub-agent reports into:

1. **Outdated sections** - Content that no longer matches implementation
2. **Missing documentation** - New features/APIs not documented
3. **Reorganization needs** - Structural improvements for clarity
4. **Broken examples** - Code samples that need updating

### Step 4: Apply Updates

1. Update sections in logical order (top-to-bottom)
2. Preserve existing accurate content
3. Add new sections where needed
4. Remove deprecated information
5. Validate code examples compile

## Output Format

```markdown
# README Update Report

## Analysis Summary
[One paragraph overview of changes needed]

## Sections Updated
| Section | Change Type | Description |
|---------|-------------|-------------|
| Installation | Updated | New dependency added |
| API Reference | Added | New `createClient()` function |
| Examples | Fixed | Updated import paths |

## Sections Reorganized
[Describe any structural changes and rationale]

## Code Examples Validated
- [x] Quick start example
- [x] API usage example
- [ ] Advanced configuration (needs fix)

## Changes Applied
[Summary of edits made to README.md]
```

## Organization Guidelines

When reorganizing README content:

- **Order by user journey**: Installation → Quick Start → API → Configuration → Examples → Contributing
- **Keep related items together**: Don't scatter API docs across sections
- **Progressive disclosure**: Simple usage first, advanced options later
- **Code examples near relevant docs**: Don't separate explanation from demonstration

## Example

**Input**: User says "update the readme, I just added the Groq provider"

**Action**:
1. Scan for Groq-related files and exports
2. Check README for provider documentation
3. Add Groq to supported providers list
4. Add Groq-specific configuration if unique
5. Update any provider count references

**Output**: Updated README with Groq documentation + report of changes made

## Notes

- Always preserve user's existing README style and voice
- Don't add sections that aren't warranted by actual code
- Verify examples actually work before including them
- Cross-reference with existing documentation patterns in codebase
