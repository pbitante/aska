---
name: spec-conformance
description: Does the build do exactly what its spec says, including the contracts others rely on?
applies_when: The subject has a spec, acceptance criteria, or a stated contract (formats, exit or status codes, an API, compatibility with an earlier version). With no spec, the commit messages, README and usage text are the contract.
threshold: medium
---

## Looks for
Gaps between the spec (and its Corrections, which win), or what the commit messages, README and usage text claim, and what the code does: an acceptance
criterion met only on the happy path, a stated contract (exit codes, status codes, output
formats, error messages) that differs from the spec or from neighbouring commands, behaviour
that holds in one mode or version but not another.

## Questions
- Which acceptance criterion is this code meant to satisfy, and does it satisfy all of it?
- Does every stated contract match the spec and the existing commands or endpoints next to it?
- Does it still work with the previous version on the other side of each interface?

## Red flags
- A criterion marked done in traceability, or a cleanup a commit message calls complete, that isn't
- A rule or fix applied to one mode, path or error case and silently skipped in its sibling
- A new flag or behaviour missing from the usage text, help output or README
- A condition broader or narrower than the case its message or name describes

## Good looks like
Every criterion and contract can be pointed at in code and in a failing-without-it test, in every mode and against the previous version.
