# File formats

## Where files live

| Scope | Folder | Use for |
|---|---|---|
| Project | `.claude/personas/` | personas the team shares through the repository |
| User | `~/.claude/personas/` | personal personas |
| Plugin | `<install path>/personas/` | shipped starter units (read-only) |

Personas are `<name>.persona.md` and units are `<name>.unit.md`. The `name:` field must equal `<name>`. Other `.md` files in the folder are ignored with a warning, and subfolders are not read. A more specific scope's file replaces a same-named file in a less specific scope. `aska:<name>` always means the shipped starter unit.

## Unit

```markdown
---
name: rollback-safety
description: One line: the question this unit asks.
applies_when: When the unit is relevant (optional; recommended when relevance varies).
threshold: medium          # low | medium | high | critical: minimum severity to raise a finding
---

## Looks for
Prose: what it examines, and what it leaves to neighbouring units.

## Questions
- 2–4 concrete questions

## Red flags
- 2–4 observable red flags

## Good looks like
One line.
```

These four headings are required and are the only ones allowed.

## Persona

```markdown
---
name: example
description: One line on what this persona weighs and why you'd use it.
extends: base-persona            # optional; one parent
units:
  primary:                       # ranked, most important first; at most 7
    - edge-cases
    - rollback-safety:
        threshold: low
        add_questions:
          - Has the rollback run in staging?
        add_red_flags:
          - Rollback depends on a person being awake
  secondary:
    - maintainability
    - aska:cost:
        threshold: high
  deprioritized:
    - code-style:
        note: Only raise style if it hides a bug.
  exclude: [scope-creep]         # only with extends: drop an inherited unit
  primary_order: [rollback-safety, edge-cases]   # only with extends: reorder inherited primaries
judgment:
  sections:
    - name: Suggested checks
      ask: Concrete checks that would catch the findings above.
capabilities:
  skills:
    - name: superpowers:test-driven-development
      when: proposing how to verify a fix
  mcp:
    - name: playwright
      when: checking user-facing behaviour
  tools: [Bash]                  # panel subagent only
overrides:                       # only with extends
  aska:rollback-safety.threshold: child
---

## Stance
How this persona approaches a problem, and why.

## Tie-breaking
When its units conflict, which wins (name the units).

## Context
Any other `##` section is optional extra prose, included as written.
```

**Settings allowed per tier:**
- `primary`: `threshold`, `add_questions`, `add_red_flags`;
- `secondary`: `threshold`;
- `deprioritized`: `note` (its threshold is always critical).

A unit may appear only once per file. A root persona (no `extends`) needs a `description`, at least one primary unit, `## Stance` and `## Tie-breaking`. A child persona needs only `name` and `extends`; everything else is a change on top of the parent.

## Clashes and overrides

When a child changes something the parent set, the child wins by default, and `validate` reports an **unreviewed clash**. To mark it reviewed, add `<id>: child` under `overrides:`. To let the parent win, add `<id>: parent`.

| Clash ID | Raised when the child… |
|---|---|
| `<unit>.tier` | moves a unit to another tier |
| `<unit>.threshold` | changes a threshold |
| `<unit>.note` | changes a deprioritized note |
| `<unit>.excluded` | excludes an inherited unit |
| `primary-order` | reorders inherited primaries |
| `stance`, `tie-breaking` | replaces that section |
| `section:<heading>` | replaces an extra prose section |
| `judgment:<name>` | redefines a judgment section |
| `capability:<skills\|mcp>:<name>` | redeclares a capability |

Use the canonical unit name in IDs, for example `aska:cost.threshold` for a starter unit.
