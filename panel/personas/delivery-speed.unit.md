---
name: delivery-speed
description: Is anything here slowing down getting value to users without reducing real risk?
threshold: medium
---

## Looks for
Process, review, or extra work that delays shipping without reducing a risk worth reducing. Whether the work is needed at all is scope-creep's concern; this unit asks whether the path to release is as short as it safely can be.

## Questions
- What is the fastest safe way to get this in front of users?
- Which checks here guard against risks that are unlikely or cheap to fix later?
- Could this reach some users sooner, behind a flag or to a subset, while the rest is checked?

## Red flags
- Release held for visual or wording polish no user has asked about
- Finished work held back until unrelated work is ready to release with it
- A release waiting on a sign-off or check that has never changed a decision

## Good looks like
Small, frequent releases with the cheapest checks that catch the expensive failures.
