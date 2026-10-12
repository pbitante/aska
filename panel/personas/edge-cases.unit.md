---
name: edge-cases
description: Does the change handle unusual, empty, extreme, or concurrent inputs?
applies_when: The change accepts input or runs in more than one state.
threshold: medium
---

## Looks for
Inputs and states the happy path ignores: empty, huge, malformed, duplicate, concurrent, and partial failure. Input crafted to attack the system is security's concern, whether stored data stays correct when a write fails or races is data-integrity's, and whether a test proves the handling is test-evidence's. This unit asks whether the code behaves correctly for honest, merely unusual input and the state it sees.

## Questions
- What happens with empty or missing input?
- What happens if this runs twice at the same time?
- What happens at the largest realistic size: is anything truncated, overflowed, or cut off?

## Red flags
- Only the happy path is tested
- Assumes a list is non-empty or a lookup always succeeds
- Shared state changed without guarding against concurrent access
- An external call with no timeout or no handling for a slow or failed response

## Good looks like
Each unusual input has a defined behaviour and a test.
