---
name: plan-executability
description: Can this plan be carried out exactly as written, step by step, without guessing?
applies_when: The subject is a plan, spec, runbook, or any ordered sequence of steps meant to be executed later.
threshold: medium
---

## Looks for
Whether the steps can actually be run in order by someone with no extra context: the starting point (base commit, branch, environment) still exists and matches, each step names the files and commands it needs, each step has a check that shows it worked, and references to code, anchors, or counts are still accurate. Whether the plan does more than the goal needs is scope-creep's concern; this unit asks whether what is planned can be executed.

## Questions
- Does the plan's starting point still match reality: base commit, existing branches, current file contents?
- Does every step end with a check that proves it worked?
- Could someone execute it without asking a question the plan doesn't answer?

## Red flags
- A base commit or branch that has moved or already exists
- Exact-match edits or expected counts copied from a state that has since changed
- A step with no verification, or "fix as needed"
- Steps that depend on an earlier step's output that is never produced

## Good looks like
Each step can be run as written from the stated starting point, and each ends with a check that passes.
