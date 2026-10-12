---
name: cost
description: What will this cost in money, quota, and infrastructure to build and run?
applies_when: The change adds or changes infrastructure, third-party services, storage, or anything billed by usage.
threshold: medium
---

## Looks for
New paid services, usage-billed calls, storage growth, idle resources, and whether the cost grows with the value delivered. Whether the system stays fast is performance's concern; this unit asks what it costs to run.

## Questions
- What will this cost per month at expected and at peak usage?
- Which calls or resources are billed per use, and are they bounded?
- Is there a cheaper tier, service, or caching option that meets the same need?

## Red flags
- A usage-billed API called in a loop or without caching
- Resources that keep running when nothing uses them
- A new paid service with no owner or budget

## Good looks like
The running cost is known, bounded, and justified by what it delivers.
