---
name: rollback-safety
description: Can this change be undone quickly and safely if it goes wrong?
applies_when: The change alters persistent state, configuration, deployed behaviour others depend on, or external contracts.
threshold: medium
---

## Looks for
How the change would be reversed, and what cannot be reversed: data migrations, sent messages, published APIs. Whether the data is correct in the first place is data-integrity's concern; whether anyone will notice the failure is observability's.

## Questions
- What is the rollback path, and has it been exercised?
- Does anything become irreversible once this ships?
- Can the old and new versions run side by side during the switch?

## Red flags
- Destructive migration with no backup or down-migration
- User-facing change shipped without a flag or kill switch
- An external contract changed in a way older clients cannot handle

## Good looks like
A one-step revert or flag flip, with no data loss.
