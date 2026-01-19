---
name: changelog-generator
description: Generate structured changelogs for app releases from git history. Use when preparing releases, documenting changes, or creating version notes.
allowed-tools: Read, Bash(git:*)
---

# Changelog Generator

> Generate clean, developer-friendly changelogs from git history with code samples for breaking changes.

## When to Use

- Preparing a new release
- Documenting changes since last version
- Creating release notes
- Reviewing what changed between tags

## Instructions

### Step 1: Determine Version Range

```bash
# Find the last release tag
git describe --tags --abbrev=0

# List recent tags for reference
git tag --sort=-version:refname | head -5
```

### Step 2: Gather Commits

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

### Step 3: Generate Changelog

Create `.changelogs/{version}.md` with:

1. **Simple checklist format** - one item per meaningful change
2. **No unnecessary comments** - keep it scannable
3. **Code samples for breaking/API changes** - brief, compliant examples

## Output Format

```markdown
# v{version}

## Changes

- [ ] Added: Feature description
- [ ] Fixed: Bug description  
- [ ] Changed: Behavior change description
- [ ] Removed: Deprecated item

## Breaking Changes

### Change Title

Brief description of what changed.

```ts
// Before
oldMethod(param: string)

// After  
newMethod(param: string, options?: Options)
```

## Migration Notes

[Only if applicable - brief migration steps]
```

## Guidelines

- **Group by type**: Added, Fixed, Changed, Removed, Deprecated
- **Be concise**: One line per change, details only when needed
- **Code samples**: Only for developer-facing changes that need examples
- **Language tags**: Always include language in code blocks (e.g., `ts`, `js`, `bash`)

## Example

**Input**: Generate changelog for v2.1.0

**Output**: `.changelogs/v2.1.0.md`

```markdown
# v2.1.0

## Changes

- [x] Added: WebSocket reconnection with exponential backoff
- [x] Fixed: Memory leak in event listener cleanup
- [x] Changed: Default timeout from 30s to 60s

## Breaking Changes

### Event handler signature updated

```ts
// Before
client.on('message', (data) => {})

// After
client.on('message', (data, metadata) => {})
```
```

## Notes

- Infer version from context or prompt user if unclear
- Skip merge commits and version bump commits
- Focus on user/developer-facing changes
