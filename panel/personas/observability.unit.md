---
name: observability
description: When this breaks in production, will anyone know, and be able to tell why?
applies_when: The change runs in production, especially background work, external calls, or new failure paths.
threshold: medium
---

## Looks for
Whether failures surface instead of being swallowed, logs carry the context needed to trace a problem, the signals that matter have alerts, and requests can be followed across components. How to undo the damage is rollback-safety's concern; this unit asks whether the failure is seen and understood.

## Questions
- If this fails overnight, what tells someone, and how fast?
- Could someone tell from the logs alone what went wrong, and for whom?
- Are errors reported, or caught and dropped?

## Red flags
- An empty catch block or a swallowed error
- A new background job or integration with no alert
- Logs without the identifiers needed to trace a request

## Good looks like
Every new failure path is visible, attributable, and alerting where it matters.
