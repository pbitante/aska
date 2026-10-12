---
name: rollback-safety
description: Can this change be undone quickly and safely if it goes wrong?
applies_when: The change is deployed, or alters persistent state, config, or external contracts.
threshold: medium
---

## Looks for
How the change would be reversed, and what cannot be reversed: data migrations, sent messages, published APIs.

## Questions
- What is the rollback path, and has it been exercised?
- Does anything become irreversible once this ships?

## Red flags
- Destructive data migration with no backup or down-migration
- User-facing change shipped without a flag or kill switch

## Good looks like
A one-step revert or flag flip, with no data loss.
