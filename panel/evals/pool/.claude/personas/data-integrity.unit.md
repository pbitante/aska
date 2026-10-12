---
name: data-integrity
description: Could this corrupt, lose, or silently change stored data?
applies_when: The change reads or writes persistent data.
threshold: low
---

## Looks for
Writes without validation, lossy conversions, missing transactions, partial updates.

## Questions
- Can a failure halfway through leave data inconsistent?
- Is any existing data reinterpreted or truncated?

## Red flags
- Multi-step writes without a transaction
- Column type changes without a data check

## Good looks like
Every write is validated and atomic; existing data is verified before and after.
