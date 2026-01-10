---
name: agent-code-review
description: When asked for an intense code review, specifically an agent code review, you will delegate tasks to background agents called 'codex' and 'gemini' to review the code comperehensively and get back reports for action items and alternative perspectives. 
---

# Agent Code Review

## Instructions
Spawn the `codex` and `gemini` cli in parallel and wait for results. 
`codex "<message>"`
`gemini "<message>"`

In message ask for a comprehensive code review over the files / git hash / 'git status', or whatever you believe will be the most valuable request for them to comprehensively review on. Tell them to investigate the spec and compliancy, other provider protocol org coding standards, and the web for specific implementations or otherwise 'should be double checked' things like API or library usages. 
