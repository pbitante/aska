# Author skill evals

These check that the `author` skill, given a complete brief, produces a valid persona built mostly from starter units, without touching the plugin.

    npx tsx evals/author/run.ts --dry-run     # print prompts and flags; no API calls
    npx tsx evals/author/run.ts               # 3 `claude -p --plugin-dir` runs (costs money)

Each brief runs in a fresh temporary project. A run passes when every project:
- has exactly one persona, with 0 errors;
- uses at least 3 starter units and at most 7 primary units;
- leaves the plugin's `personas/` folder unchanged;
- writes nothing outside the temporary project (see "Isolation from the machine" below);

and no two personas share the same primary set. Results go to `evals/results/author-*.json` (git-ignored), with each run's permission denials, the full `argv` spawned (minus the per-brief prompt) and `claude --version`, and each run's full `stream-json` transcript in the sibling `author-*/` folder. This suite is not part of CI.

## Isolation flags

`--setting-sources ''`, `--strict-mcp-config` (so the only MCP server is the approver below), and `--no-session-persistence` are used (see `evals/README.md` for what each does), but **not** `--safe-mode`: that flag also disables installed plugins, which would stop `--plugin-dir`'s `author` skill from loading. Verified live: with `--setting-sources ''`, `--strict-mcp-config`, `--no-session-persistence`, and `--plugin-dir <repo>`, a probe prompt listing available skills still reports `aska:author`.

`--allowedTools` takes a variadic list, so when it is the last flag before the prompt the CLI's argument parser swallows the prompt text into the tool list instead of treating it as the prompt, and exits with "Input must be provided either through stdin or as a prompt argument when using --print". `run.ts` adds a literal `--` between the flags and the prompt to stop this.

## Permissions

Claude Code protects everything under `.claude/`. In `-p` mode a Write or Edit to `.claude/personas/...` is denied as "a sensitive file" even when `--allowedTools Write`, a path-scoped rule (`Write(/.claude/personas/**)`, by flag or `--settings`), `--permission-mode acceptEdits`, or `--permission-mode auto` allows it (verified with Claude Code 2.1.282). Without a way through, the skill can't save the persona, which is why the first real run found no persona in `.claude/personas/`.

`run.ts` doesn't bypass permissions. Instead it passes `--permission-prompt-tool` with `approve-personas.mjs`, a small stdio MCP server that answers those prompts. It approves Write and Edit only for `<project>/.claude/personas/<file>.persona.md` or `.unit.md`, and denies everything else. It resolves the real (symlink-following) path of both the target's parent directory and the file itself before allowing a write, so a symlink placed inside `.claude/personas/` — or a symlinked directory component that a `..` segment would lexically fold back inside the folder — can't be used to write somewhere else. Real users can't reach this: it's wired up only by `run.ts`, through `--mcp-config` and `--permission-prompt-tool`, and nothing in the plugin loads it.

## Isolation from the machine

The eval must not depend on the user's `~/.claude`, and must not touch anything outside the brief's own temporary project.

- **Inputs.** Each run spawns `claude` with `PERSONA_HOME` set to a fresh, empty temp directory and `PERSONA_PLUGINS_JSON` set to a temp file containing `[]`. The CLI reads `PERSONA_HOME ?? homedir()` for the user scope, and reads `PERSONA_PLUGINS_JSON` instead of running the real `claude plugin list` when it's set (`src/cli/bin.ts`). The bundle still finds the repo's own starter units through `selfPluginRoot`, so this only removes dependence on the user's installed plugins and any persona they may have under `~/.claude/personas`, not on the plugin under test. Both values are recorded per run in the results JSON (`personaHome`; `pluginsJsonFile` is shared and recorded once at the top level).
- **Outputs.** Before and after each run, `run.ts` snapshots (path, size, mtime) three trees and diffs them (`checks.ts`): the repo, via `git ls-files -co --exclude-standard` (`snapshotGitTree`) — tracked files plus untracked-but-not-ignored ones, so it naturally skips `.git`, `evals/results/`, `node_modules`, and any other gitignored tree (`.worktrees/`, `.superpowers/`, …) without an exclusion list to keep in sync; and the real `~/.claude/personas` and that run's `PERSONA_HOME`, via a plain recursive walk (`snapshotTree`), since neither is a git repo. Any added, removed, or modified file in any of the three is a check problem, prefixed with which tree it was in. This is what actually enforces "write nothing outside the temporary project" — it doesn't matter which tool the model used to do it.
- **`Bash(node *)` stays unnarrowed.** We considered narrowing the allow rule to the exact persona CLI invocation (e.g. `Bash(node "<bundle path>" *)`), which would stop a `node -e` workaround at the permission layer instead of only detecting it afterwards. It wasn't done: allow-rule matching is a literal prefix/glob match on the command text the model actually writes, and the skill tells it to quote the base directory and include a literal `..` segment (`skills/author/SKILL.md`'s "Tools" section) — a rule that didn't match that exact text would silently break a live, paid eval run, and this suite gets at most 2 real attempts. The snapshot diff above doesn't have that failure mode, so it carries the real burden of proof; narrowing the allow rule, if ever done, would be defense in depth on top of it, not instead of it.
