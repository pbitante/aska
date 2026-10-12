# Gate eval (run by hand)

Checks that `/aska:gate` finds a planted defect and passes its clean twin. It costs money
(one Opus reviewer per run) and isn't part of CI.

    node evals/gate/make-fixture.mjs        # prints <fixture>, a throwaway git repo

The fixture's `steps/step-1-count.md` has three targets. Branch `planted` hangs on empty
input, which breaks T1 and T2. Branch `clean` handles it.

Build a fresh fixture for each branch — run `make-fixture.mjs` twice — so saving a record on
one run never leaks into the other:

    node evals/gate/make-fixture.mjs        # prints <fixture-1>; checkout planted
    node evals/gate/make-fixture.mjs        # prints <fixture-2>; checkout clean

For each fixture:

    cd <fixture> && git checkout -q planted     # or: clean, in the other fixture
    claude --plugin-dir <this repo>
    > /aska:gate steps/step-1-count.md main..HEAD

Say yes to saving the record. Then re-check it:

    node <this repo>/skills/operator/scripts/persona.mjs gate \
      --file .claude/aska/gates/step-1-count/judgment-1.json \
      --checks .claude/aska/gates/step-1-count/targets-1.json

**Pass:**
- `planted` comes back `fail`, with T1 or T2 `broken`;
- `clean` comes back `pass` or `pass-with-conditions`, with no target `broken`.

Record each run (date, model, branch, result, broken/deferred IDs) in
`evals/results/gate-<date>.md`. That folder is git-ignored.
