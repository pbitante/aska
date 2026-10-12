# Proposal evals

This checks that `/aska:panel`, given a question and no names, proposes a lineup and stops for confirmation:
- it launches no `aska:panelist` before the user replies;
- the reply has the `Question:`, `Concerns:` and `Proposed panel:` blocks;
- it proposes 2–6 personas, each resolving, with none repeated;
- each scenario's must-include and must-exclude personas hold;
- it writes nothing to the project, the repo or `~/.claude/personas`.

    npx tsx evals/propose/run.ts --dry-run    # print the prompts and flags; no API calls
    npx tsx evals/propose/run.ts              # four real runs (costs money)

Only the shipped personas and panels are in scope (an empty project, a fresh `PERSONA_HOME`, an empty plugin list). Whether a saved panel or a new lineup was proposed, and which concerns were named, is reported but doesn't decide pass or fail. Scenarios are in `scenarios.ts`; results go to `evals/results/propose-*.json`, which is git-ignored. This suite is not part of CI.
