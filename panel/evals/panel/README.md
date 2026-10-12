# Panel evals

This checks that `/aska:panel`, given guardian and accelerator and the migration scenario:
- launches both panelists in one turn;
- gets valid judgments;
- writes `panel-result.json`;
- produces a report with the Verdicts, disagree, agree and Follow-ups sections;
- doesn't modify the project.

    npx tsx evals/panel/run.ts --dry-run    # print the prompt and flags; no API calls
    npx tsx evals/panel/run.ts              # one real run (costs money)

Whether the verdicts differ is reported but doesn't decide pass or fail. Results go to `evals/results/panel-*.json`, which is git-ignored. This suite is not part of CI.
