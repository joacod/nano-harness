# Multi Turn Recall

## Goal
Use prior conversation context in a later run without relying on hidden state.

## Expected Capabilities
- Persist messages and run events across turns.
- Use bounded context from the conversation snapshot.
- Export transcript and event history.

## Success Criteria
- Later response correctly references earlier user constraints.
- Export contains both the original and later turns.
