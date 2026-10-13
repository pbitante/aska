# Panel evals

This checks that `/aska:panel`, given guardian and accelerator and the migration scenario:
- launches both panelists in one turn;
- gets valid judgments;
- writes `panel-result.json`;
- produces a report with the Verdicts, disagree, agree and Follow-ups sections;
- doesn't modify the project.

The panel skill keeps its run in the kept-run store (`$PERSONA_HOME/.claude/aska/runs/<run id>/`, aska 0.4.0 and later), or in an `aska-panel-*` temp folder when `runs new` fails. The harness accepts either: its approver allows writes into a run folder (not symlinked, not outside it) and the PERSONA_HOME diff ignores changes inside a `.claude/aska/runs/<run id>/` folder. Any other write there still fails the run.

    npx tsx evals/panel/run.ts --dry-run    # print the prompt and flags; no API calls
    npx tsx evals/panel/run.ts              # one real run (costs money)
    npx tsx evals/panel/run.ts --mixed-models   # one real run with --model haiku and accelerator@sonnet

With `--mixed-models`, the run also fails unless `panel-result.json` records guardian on `haiku` (`run`) and accelerator on `sonnet` (`panelist`), and every `aska:panelist` launch passes that model. The cost rows must include a haiku model; a sonnet row is required only when `--model` is not `sonnet`, because the eval's own session runs on `--model` and always has that row.

Whether the verdicts differ is reported but doesn't decide pass or fail. Results go to `evals/results/panel-*.json`, which is git-ignored. This suite is not part of CI.
