---
name: edge-cases
description: Does the change handle unusual, empty, extreme or concurrent inputs?
applies_when: The change accepts input or runs in more than one state.
threshold: medium
---

## Looks for
Inputs and states the happy path ignores: empty, huge, malformed, duplicate, concurrent, partial failure.

## Questions
- What happens with empty or missing input?
- What happens if this runs twice at the same time?

## Red flags
- Only the happy path is tested
- Assumes a list is non-empty or a lookup always succeeds

## Good looks like
Each unusual input has a defined behaviour and a test.
