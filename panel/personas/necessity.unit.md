---
name: necessity
description: Does every class, layer, option and line earn its place?
applies_when: The change adds, restructures or keeps code that could be smaller.
threshold: low
---

## Looks for
Code that could be deleted or inlined with nothing a user or test would notice: classes with
one method or one implementation, wrappers that only forward, single-use helpers, options
nobody sets, speculative generality, dead code, and new code duplicating something that
exists. Whether the change does more than the problem needs is scope-creep's concern; this
unit asks whether the code that does the needed work is as small as it can be. Whether the
needed code, once it exists, is easy to live with is maintainability's concern.

## Questions
- What breaks if this is deleted or inlined?
- Is there a second caller, implementation or setting today, not someday?
- Does something in the codebase already do this?

## Red flags
- An interface, base class or factory with exactly one implementation
- A class holding no state, used as a namespace for functions
- Parameters, flags or config that every caller passes the same way

## Good looks like
The smallest code that does the job, reusing what's already there.
