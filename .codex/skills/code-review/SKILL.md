---
name: code-review
description: Comprehensive multi-agent code review with parallel analysis. Use for thorough code reviews, finding bugs, checking regressions, or getting alternative implementation perspectives.
context: fork
---

# Agent Code Review

> Orchestrate parallel sub-agent reviews for comprehensive code analysis and actionable feedback.

## When to Use

- Deep code review before merge
- Bug hunting and regression detection  
- Getting alternative implementation perspectives
- Validating library/API usage correctness

## Instructions

### Step 1: Determine Review Scope

Identify what to review:

```bash
# Option A: Recent changes
git diff HEAD~1

# Option B: Staged changes  
git diff --staged

# Option C: Specific commit range
git log --oneline -10  # then select range

# Option D: Current working state
git status
```

### Step 2: Spawn Review Sub-Agents

Deploy parallel sub-agents with focused tasks:

| Sub-Agent | Task |
|-----------|------|
| **Spec Reviewer** | Check implementation against `UPP-1.3.spec.md` and compliance requirements |
| **Standards Reviewer** | Compare against existing provider patterns and org coding standards |
| **Bug Hunter** | Search for regressions, edge cases, error handling gaps |
| **API Validator** | Web search to verify API/library usage correctness |

**Prompt each sub-agent with:**
> "Perform a comprehensive code review of [scope]. Investigate spec compliance, coding standards consistency, and validate any API/library usage against current documentation. Report findings as actionable items."

### Step 3: Collect and Synthesize

Aggregate sub-agent reports into:

1. **Critical issues** requiring immediate fix
2. **Recommendations** for improvement
3. **Alternative approaches** worth considering
4. **Regression risks** with resolution plans

## Output Format

```markdown
# Code Review Report

## Files Reviewed
- `path/to/file1.ts`
- `path/to/file2.ts`

## Critical Issues 🔴
| File | Line | Issue | Fix |
|------|------|-------|-----|

## Recommendations 🟡
| File | Line | Suggestion | Rationale |
|------|------|------------|-----------|

## Alternative Perspectives 🔵
[Alternative implementation approaches from sub-agents]

## Regression Analysis
| Risk | Affected Area | Resolution Plan |
|------|---------------|-----------------|

## Action Items
- [ ] Fix: [critical item]
- [ ] Consider: [recommendation]
- [ ] Verify: [needs validation]
```

## Notes

- Sub-agents should search the codebase for similar patterns before suggesting changes
- Always create resolution plans for identified regressions
- Validate external dependencies against their official documentation
