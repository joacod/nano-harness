# Repo Survey

## Goal
Inspect an unfamiliar repository and summarize its package boundaries without making changes.

## Expected Capabilities
- Use directory listing, glob, grep, and bounded reads.
- Avoid write and shell actions.
- Export the event trace and tool calls.

## Success Criteria
- Summary names the main packages and app entry points.
- Evidence packet contains search/read tool calls.
- No changed files are reported.
