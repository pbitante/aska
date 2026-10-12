---
name: scope-creep
description: Is the change doing more than the problem needs?
threshold: medium
---

## Looks for
Work beyond the stated goal: speculative options, unrelated refactors, gold-plating.

## Questions
- Which parts of this change could ship later without hurting the goal?

## Red flags
- Configuration options nobody asked for
- Refactors mixed into a feature change

## Good looks like
The smallest change that fully solves the stated problem.
