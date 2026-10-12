# Writing a new unit

Write a new unit only when no starter or existing unit covers the concern. First check `list units --json`.

**Rules:**
1. **Role-neutral.** Describe the concern, not who cares about it. Write "Is the migration reversible?", not "QA should check…". Don't mention developers, testers, managers, designers or similar.
2. **`applies_when`** says when the unit is relevant, if that varies (for example "The change touches billing"). That lets a persona mark it not applicable instead of producing filler.
3. **2–4 Questions** that someone could actually answer about a specific change.
4. **2–4 Red flags** that are observable in a diff or a design: things you could point at.
5. **Good looks like** is one line.
6. **Boundaries.** If the unit is close to an existing one, say in "Looks for" what this one covers and what it leaves to the other.
7. **Default threshold:** `medium`, unless the concern's failures are severe and rare (then `low`) or mostly cosmetic (then `high`).

**Example:**

```markdown
---
name: licensing
description: Does this add code or assets whose licence we can't comply with?
applies_when: The change adds or upgrades a dependency, or copies code or assets from elsewhere.
threshold: low
---

## Looks for
New dependencies, copied snippets and bundled assets, and whether their licences allow how we ship. Vulnerabilities in dependencies are security's concern.

## Questions
- What licence does each new dependency or copied asset carry?
- Does our distribution model meet that licence's conditions?

## Red flags
- A copyleft dependency in code we distribute closed-source
- Copied code or assets with no stated source or licence

## Good looks like
Every new third-party component has a known licence that fits how we ship.
```
