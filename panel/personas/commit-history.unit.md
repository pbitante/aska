---
name: commit-history
description: Does the branch's commit history tell a clean story that can be read, bisected and reverted one step at a time?
applies_when: The subject is a branch, PR or commit range with more than one commit.
threshold: medium
---

## Looks for
Whether each commit is one coherent step that builds and passes on its own; fixup, "wip", "address review" and revert-of-own-commit noise; commits that only undo or redo earlier ones on the same branch; and messages that say why the change was made. How readable the code itself is is maintainability's concern; this unit asks whether the sequence of commits that delivers it is easy to read, bisect and revert.

## Questions
- Does each commit build and pass on its own, so a bisect never lands on a broken step?
- Which commits exist only to fix, undo or redo an earlier commit on the same branch?
- Does each message say why the change was made, not just what it touched?
- Could the commits be read in order without meeting a change that a later commit takes back?

## Red flags
- Messages like "wip", "fix", "oops" or "address review"
- A revert of a commit made earlier on the same branch
- One commit mixing unrelated changes, or one change split across commits that don't build alone
- A later commit that renames or rewrites what an earlier commit on the branch just added

## Good looks like
Each commit is one buildable step whose message says why, and none exists only to repair another.
