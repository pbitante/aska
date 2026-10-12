# Choosing and ranking units

- **Primary** is what this persona exists to catch. Rank it: the first unit wins most conflicts. Keep it to 3–5 units; the hard limit is 7. If everything is primary, nothing is.
- **Secondary** is worth a glance. It shows up in the prompt as one line per unit, and is raised only above its threshold.
- **Deprioritized** is for concerns Claude raises by habit that this persona should resist, for example a speed-focused persona that shouldn't nitpick style. These units are raised only when critical. Use the `note` to say how to resist.
- **Left out** means silence. Prefer leaving a unit out over deprioritizing it, unless Claude would otherwise raise that concern anyway. Mentioning a concern primes it.

## Thresholds

`threshold` is the minimum severity for a finding:

| Threshold | Meaning |
|---|---|
| `low` | raise anything noticeable; for the persona's core concern |
| `medium` | raise real problems; the usual default |
| `high` | raise only serious problems; for concerns the persona respects but doesn't police |
| `critical` | effectively silent unless something is about to go badly wrong |

## Pinned vs bare references

A starter unit can go in a persona's `units` lists two ways:

- **Bare** (`security`): resolves to the most specific scope that defines `security`. If the user or project later adds their own unit named `security`, this persona follows that override instead of the starter unit.
- **Pinned** (`aska:security`): always resolves to the shipped starter unit, ignoring any same-name user or project override.

Prefer the bare name, so a later local override takes effect automatically. Pin only when the persona specifically needs the shipped unit's behavior and should ignore a local override.

## Making personas differ

Two personas built from the same units are still different if their **primary sets** or **rankings** differ. A useful contrast is one persona's primary unit sitting in another's deprioritized tier, for example `delivery-speed` versus `rollback-safety`. If two personas end up with the same primary set, change one, or merge them.
