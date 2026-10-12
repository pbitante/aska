---
name: scope-creep
description: Is the change doing more than the problem needs?
threshold: medium
---

## Looks for
Work beyond the stated goal: speculative options, unrelated refactors, and gold-plating. How easy the necessary work is to live with is maintainability's concern; how fast it ships is delivery-speed's; whether a plan can be executed as written is plan-executability's; whether the code doing the needed work could be smaller is necessity's.

## Questions
- Which parts of this change could ship later without hurting the goal?
- Which options or settings did nobody ask for?
- Is any refactor here required by the change, or just nearby?

## Red flags
- Configuration options nobody asked for
- Refactors mixed into a feature change
- Generalising for cases that do not exist yet

## Good looks like
The smallest change that fully solves the stated problem.
