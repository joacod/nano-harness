# Approval Pause Resume

## Goal
Pause on an approval-gated action and resume after approval.

## Expected Capabilities
- Require approval for write or guarded command actions.
- Persist approval request and resolution.
- Resume the run after approval.

## Success Criteria
- Timeline includes approval required and granted events.
- The action does not execute before approval.
- Export contains approval state.
