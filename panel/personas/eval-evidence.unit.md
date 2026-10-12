---
name: eval-evidence
description: Is the claimed quality of a model-driven feature backed by enough evaluations of the right kind?
applies_when: The change adds or alters a prompt, a model, or model-driven behaviour, or makes claims about its quality.
threshold: medium
---

## Looks for
Whether quality claims rest on evaluations that cover realistic and adversarial cases, run enough times to separate signal from sampling noise, compare against a baseline, and would catch a regression. Deterministic code paths proven by ordinary tests are test-evidence's concern; this unit covers evidence for behaviour that varies run to run.

## Questions
- Which evals cover this change, and how many runs back each result?
- Is there a baseline (the previous prompt or model) to compare against?
- Do the eval cases include the hard and adversarial ones, or only the demo?

## Red flags
- Quality judged from a handful of manual tries
- A prompt or model change with no eval rerun
- Pass rates reported without the number of runs or a baseline
- Eval cases written after the fact to match the output

## Good looks like
Every quality claim cites an eval with enough runs, realistic and adversarial cases, and a baseline it beats.
