---
name: comment-noise
description: Does each comment say something the code can't?
applies_when: The change adds or edits comments, docstrings or doc blocks.
threshold: medium
---

## Looks for
Comments that restate the code, narrate history ("changed X to Y", "added for ticket…"),
repeat a signature's types, have gone stale, or are commented-out code. Keep the why,
invariants, non-obvious constraints and links to the reason. Whether the code under the
comment should exist at all is necessity's concern; whether that code, comment aside, is
easy to live with is maintainability's.

## Questions
- Would a reader lose anything if this comment were deleted?
- Does it still match the code below it?

## Red flags
- Commented-out code
- A docstring that only repeats the function name and parameter types

## Good looks like
Few comments, each one explaining a why the code cannot show.
