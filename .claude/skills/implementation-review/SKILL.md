---
name: implementation-review
description: Review feature implementations for spec compliance, code quality, and organizational consistency. Use when implementing features, checking spec compliance, validating API implementations, or preparing releases.
allowed-tools: Read, Grep, Glob, Bash(git:*), Bash(rg:*), WebSearch
context: fork
---

# Implementation Review

> Comprehensive review of feature implementations against specifications and organizational standards.

## When to Use

- Implementing or completing new features
- Validating spec compliance before merge
- Checking API implementation correctness
- Preparing release readiness assessments

## Instructions

### Step 1: Gather Context

1. Identify the implementation scope:
   ```bash
   git diff --name-only HEAD~5
   git status
   ```
2. Locate relevant specification: `UPP-1.3.spec.md` or related spec files
3. Identify affected providers/modules

### Step 2: Spawn Review Sub-Agents

Delegate parallel reviews to sub-agents for:

| Agent Focus | Review Scope |
|-------------|--------------|
| **Spec Compliance** | Compare implementation against spec requirements |
| **Code Standards** | Organizational consistency, naming, patterns |
| **API Validation** | Search web to validate API parameters, endpoints, payloads |
| **Regression Check** | Search codebase for potential breaking changes |

### Step 3: Synthesize Reports

Collect sub-agent findings and compile:

1. **Compliance gaps** - Missing or incorrect spec implementations
2. **Quality issues** - Code smells, inconsistencies, design concerns
3. **API correctness** - Validated against official documentation
4. **Regression risks** - Potential breaking changes identified

## Output Format

```markdown
# Implementation Review Report

## Summary
[One paragraph overview]

## Spec Compliance: [PASS/PARTIAL/FAIL]
- [ ] Requirement 1
- [ ] Requirement 2

## Code Quality Issues
| Severity | File | Issue | Recommendation |
|----------|------|-------|----------------|

## API Validation
[Findings from web search validation]

## Regression Risks
[Identified risks and mitigation]

## Release Readiness: [READY/BLOCKED/NEEDS WORK]
[Estimation with blockers listed]
```

## Notes

- Always validate external API usage against current documentation
- Cross-reference with existing provider implementations for consistency
- Flag any deviations from established patterns
