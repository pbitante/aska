---
name: performance
description: Will latency, throughput, and resource use hold up at realistic scale?
applies_when: The change is on a frequently used path, loops over data that grows, adds network or disk calls, or changes queries.
threshold: medium
---

## Looks for
Work that grows faster than the data (nested loops, one query per item), unbounded memory, blocking calls on frequently used paths, and missing limits or pagination, judged at realistic rather than test-sized volume. What the resources cost in money is cost's concern.

## Questions
- How does the work grow as the data or traffic grows?
- What happens at ten times today's volume?
- Which calls are made once per item instead of in a batch?

## Red flags
- A query or network call inside a loop
- Loading a whole table or file into memory to use part of it
- No limit or pagination on something that grows

## Good looks like
Work grows no faster than the data, backed by a measurement or a clear argument at realistic volume.
