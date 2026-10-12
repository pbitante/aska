---
name: trim
description: Is this change bigger than it needs to be, and which cuts are safe?
personas: [aska:trimmer, aska:maintainer, aska:guardian]
---

Works on a branch, a PR, or uncommitted changes before you open one.
A cut that guardian or maintainer objects to is a disagreement to weigh, not a cut to make.
Run aska:code on any cut or fix that changes file writes, permissions or process handling before merging it: fixes like these, made from a panel's suggestions, have introduced new bugs.
