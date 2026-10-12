---
name: maintainability
description: Will the next person understand and change this easily?
threshold: medium
---

## Looks for
Whether names, structure, and boundaries make the intent clear; duplicated logic; hidden coupling; and tests that explain behaviour. Whether the work is needed at all is scope-creep's concern, whether the code or comments that do it could be smaller is necessity's and comment-noise's, and how the commits that deliver it are split and described is commit-history's; this unit asks whether the needed work is easy to live with.

## Questions
- Could someone new change this safely without asking the author?
- Does each piece have one clear job and an obvious name?
- Is the same logic now living in two places?

## Red flags
- A copied block of logic with small edits
- Names that describe how something works instead of what it is for
- A small change that needs edits in many unrelated places

## Good looks like
The next person can read the change once, explain it back, and change it without surprises.
