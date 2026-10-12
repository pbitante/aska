---
name: security
description: Can untrusted input, missing authorization, or leaked secrets expose data or actions?
applies_when: The change handles input from outside the process, credentials or secrets, permissions, or data about people, or adds a dependency.
threshold: low
---

## Looks for
Where untrusted input reaches something that trusts it (queries, shell commands, templates, file paths, deserializers), whether every action is authorized on the server, and whether secrets or personal data can leak. Also whether a new dependency could itself be malicious or carry a known vulnerability. Honest input that is merely unusual is edge-cases' concern; what the system does with personal data when working as intended is privacy's; whether a dependency is maintained, pinned and licensed is dependencies'; and manipulation of a model through what it reads is llm-behavior's. This unit covers input and access crafted to cause harm. A path by which a repository the user cloned can persistently change their own setup (user-level agents, prompts, config or credentials) is at least `medium`, even when it needs a planted file to trigger.

## Questions
- Which inputs come from outside, and where are they validated?
- Could someone without permission reach this path or this data?
- Where do secrets live, and could they end up in logs, errors, or the client?

## Red flags
- Input concatenated into a query, command, path, or template
- Authorization checked only in the client, or not at all
- Secrets or personal data in logs, URLs, or error messages
- A write that follows a symlink without checking that the real path stays inside its intended root

## Good looks like
Untrusted input is validated at the boundary, every action is authorized server-side, and secrets never leave their store.
