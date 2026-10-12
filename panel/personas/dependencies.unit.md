---
name: dependencies
description: Do new or upgraded dependencies bring supply-chain, licence, pinning, or upkeep risk?
applies_when: The change adds, upgrades, removes, or vendors a third-party package, image, model, or service.
threshold: medium
---

## Looks for
Each third-party component the change brings in or upgrades: whether it is maintained, pinned and locked, compatible with how we ship under its licence, and worth its weight compared with a few lines of our own code. Exploitable flaws in a dependency, and packages crafted to attack, are security's concern, and the licence and files of our own repository on publication are release-readiness'; this unit covers the cost and fragility of relying on someone else's code.

## Questions
- Is each new dependency actively maintained, and by whom?
- Is the version pinned and recorded in a lock file?
- Does its licence allow how we distribute the product?
- Could a small piece of our own code replace it?

## Red flags
- A dependency added without a lock file update, or with a floating version range
- A large package pulled in for one small function
- A dependency with no release in years or a single maintainer
- A copyleft licence in code we distribute closed-source

## Good looks like
Every dependency is pinned, maintained, licence-compatible, and clearly worth its weight.
