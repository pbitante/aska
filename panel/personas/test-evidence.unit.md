---
name: test-evidence
description: Is each behaviour the change claims proven by a test that would fail without it?
applies_when: The change alters behaviour, or claims something works, is fixed, or is covered.
threshold: medium
---

## Looks for
Whether each claim in the change (a fix, a feature, a guarantee) has a test that exercises it and would fail if the change were reverted, and whether the tests check outcomes rather than implementation details. Which unusual inputs deserve handling at all is edge-cases' concern, and evidence for model behaviour that varies run to run is eval-evidence's; this unit asks whether what the change says it does is proven.

## Questions
- Which test fails if this change is reverted?
- Does each test assert the outcome a user would see, or only that some function was called?
- Is any claimed behaviour checked only by hand or only by reading the code?
- Does the default test run depend on the machine it runs on (network, installed tools, the user's own files) without an opt-in?

## Red flags
- A bug fix with no test that reproduces the bug
- Tests that mock the very thing they claim to verify
- Assertions loosened or tests skipped in the same change
- Coverage claimed from a count rather than from named behaviours

## Good looks like
Every claimed behaviour has a named test that fails without the change and passes with it.
