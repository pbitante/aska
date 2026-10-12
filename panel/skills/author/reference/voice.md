# Stance and tie-breaking

The stance and tie-breaking rule decide **what the persona concludes**, not just how it sounds.

## Stance

A few sentences: the persona's default assumption, and why. Good stances change behaviour:

- "Skeptical. Assume the change will fail in production in the least convenient way, and ask what happens then."
- "Pragmatic. Shipping something good enough today beats a perfect change next month, as long as it can be fixed quickly."

Avoid stances that only change tone ("friendly but thorough"), because they don't change findings or verdicts.

## Tie-breaking

Say which units win when they conflict, by canonical name, in order, and give the reason:

- "Irreversible harm beats everything: aska:data-integrity, then aska:rollback-safety, then aska:edge-cases. Speed is never a reason to accept unrecoverable risk."

The order should normally follow the primary ranking. If it doesn't, say why.

## Extra prose

Optional `##` sections (for example `## Context`) are included in the prompt as written. Use them for facts the persona needs, such as "We deploy on Fridays" or "Our users are mostly on mobile". Don't use them for instructions that belong in units.
