---
name: llms-md-updater
description: Update llms.md documentation for LLM consumption based on codebase changes. Use when adding providers, changing APIs, updating types, or when the LLM reference guide drifts from implementation.
allowed-tools: Read, Grep, Glob, Bash(git:*)
context: fork
---

# LLMs.md Updater

> Analyze codebase changes and update the llms.md reference guide to keep it accurate for AI model consumption.

## When to Use

- After adding new providers (e.g., "just added Groq provider")
- When core APIs or types change
- After modifying factory functions (llm, embedding, image)
- When capability matrices change
- Before releases to ensure LLM docs match code
- User says "update llms.md", "sync llm docs", "llms.md is stale"

## Instructions

### Step 1: Determine Change Scope

Identify what has changed since llms.md was last accurate:

```bash
# Find when llms.md was last modified
git log -1 --format="%h %s" -- llms.md

# Get commits since llms.md update
git log $(git log -1 --format="%h" -- llms.md)..HEAD --oneline --no-merges

# See what files changed (focus on src/)
git diff --name-only $(git log -1 --format="%h" -- llms.md)..HEAD -- src/
```

### Step 2: Spawn Analysis Sub-Agents

Deploy parallel sub-agents to analyze different aspects:

| Sub-Agent | Task |
|-----------|------|
| **Provider Scanner** | Check src/providers/ for new or modified providers, capabilities |
| **Type Analyzer** | Review src/types/ for interface changes, new types, modified signatures |
| **API Surface Scanner** | Check src/index.ts and core exports for new/changed public APIs |
| **Example Validator** | Verify code examples in llms.md against current implementation |

**Prompt each sub-agent with:**
> "Analyze [scope] and report findings relevant to llms.md accuracy. Focus on exported functions, types, provider options, and usage patterns that an LLM would need to understand."

### Step 3: Synthesize Findings

Aggregate sub-agent reports into:

1. **Outdated sections** - Content that no longer matches implementation
2. **Missing documentation** - New providers/APIs/types not documented
3. **Capability changes** - Updated provider capability matrix
4. **Broken examples** - Code samples that need updating
5. **New patterns** - Usage patterns that should be documented

### Step 4: Apply Updates

1. Update Provider Capability Matrix if providers added/changed
2. Add new provider-specific sections if needed
3. Update type definitions and interfaces
4. Fix/add code examples
5. Update environment variable references
6. Verify all imports paths are correct

## Output Format

```markdown
# LLMs.md Update Report

## Analysis Summary
[One paragraph overview of changes needed]

## Sections Updated
| Section | Change Type | Description |
|---------|-------------|-------------|
| Provider Capability Matrix | Updated | Added Groq and Cerebras |
| Anthropic Options | Updated | New beta flags available |
| Quick Start | Fixed | Import path changed |

## Providers Modified
- [x] New: Groq provider added
- [x] New: Cerebras provider added
- [ ] Updated: OpenAI new API mode

## Code Examples Validated
- [x] Basic LLM usage
- [x] Streaming example
- [ ] Tool calling (needs fix - new signature)

## Changes Applied
[Summary of edits made to llms.md]
```

## Content Guidelines

When updating llms.md content:

- **Optimize for LLM comprehension**: Clear, unambiguous examples that can be copied
- **Complete imports**: Always show full import statements
- **Type annotations**: Include TypeScript types in examples
- **Provider parity**: Document all providers consistently
- **Capability matrix accuracy**: Keep the matrix current with actual capabilities
- **Environment variables**: List all supported env vars

## Sections to Verify

Always check these sections are current:

1. **Quick Start** - Basic usage still works
2. **Provider Functions** - All providers listed with correct import paths
3. **LLMOptions interface** - Matches src/types/llm.ts
4. **Turn object** - Matches current Turn interface
5. **Message types** - Current message classes documented
6. **Tool interface** - Tool definition is accurate
7. **StreamEventType** - All event types listed
8. **Provider Capability Matrix** - Accurate for all providers
9. **Environment Variables** - All API key env vars listed
10. **Provider-Specific Options** - Params types are current

## Example

**Input**: User says "update llms.md, I just added streaming to the image modality"

**Action**:
1. Scan src/types/image.ts for streaming changes
2. Check image factory function for new methods
3. Review any new stream event types
4. Update Image Generation section with streaming API
5. Add streaming example for image generation
6. Update capability matrix if needed

**Output**: Updated llms.md with image streaming documentation + report of changes made

## Notes

- Preserve the existing document structure and style
- Keep examples simple and self-contained
- Don't remove working examples, only update outdated ones
- Cross-reference with src/index.ts exports for public API surface
- Provider-specific params come from src/providers/{provider}/types.ts
- Capability flags come from src/providers/{provider}/llm.ts
