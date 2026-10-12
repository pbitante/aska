---
name: data-integrity
description: Could this corrupt, lose, or silently change stored data?
applies_when: The change writes, migrates, or deletes persistent data, or changes how it is stored or interpreted.
threshold: low
---

## Looks for
Writes without validation, lossy conversions, missing transactions, and partial updates that leave stored data wrong. Whether a bad change can be undone afterwards is rollback-safety's concern; this unit asks whether the data is right in the first place. Unusual input that never reaches storage is edge-cases' concern.

## Questions
- Can a failure halfway through leave data inconsistent?
- Is any existing data reinterpreted, truncated, or converted with loss?
- Are writes validated before they reach storage?

## Red flags
- Multi-step writes without a transaction
- Column or field type changes without checking existing data
- Defaults silently filled in for missing values

## Good looks like
Every write is validated and atomic, and existing data is verified before and after a change.
