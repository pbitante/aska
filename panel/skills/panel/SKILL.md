---
name: panel
description: Put several personas in front of one question at once (a code change, a plan or spec, an open question, or the current conversation) and show where and why they disagree. Use when the user asks for a panel, multiple perspectives, or "what would X and Y each say".
---

# panel

Run 2–6 personas as parallel, read-only panelists. Validate and compare their judgments, and report their disagreements. A panel always has **at least 2** panelists; for a single persona, suggest the `operator` or `author` skills instead.

## Tools

First check that `<base directory>/../operator/scripts/persona.mjs` exists. If it doesn't, stop and say: "This skill must be used from the aska plugin (its operator skill and CLI are missing)."

Run the CLI from the user's project directory:

    node "<base directory>/../operator/scripts/persona.mjs" <command>

- `list personas --json`, `list panels --json`, `list units --json`: what exists.
- `prompt <name> --panel`: one persona's panel prompt.
- `check-judgment <name> --file <path>`: validate one judgment.
- `check-evidence --file <path>`: validate one investigator's evidence.
- `runs new`: create the run folder and print its path.
- `compare --file <path> --json [--record]`: compare the panel; `--record` also updates the run's `meta.json`.

`list personas --json` rows have fields `canonical, name, scope, plugin, path, description, shadowedBy, valid, errorCount, extends, units`, where `units` is `{ primary, secondary, deprioritized }`, each a list of `{ canonical, description, threshold }`, or `null` when the persona doesn't resolve or is shadowed.

`list panels --json` rows have fields `canonical, name, scope, plugin, path, description, personas, models, shadowedBy, valid, errorCount`, where `models` maps some of `personas`, exactly as listed, to `haiku`, `sonnet` or `opus` (`{}` when the panel sets none). Launch a saved panel's `personas` exactly as listed, since they are the panel's own references, already resolved the same way `checkPanelFile` resolved them; for a suggested ad-hoc panel (no saved panel), use the `canonical` name from `list personas --json`.

`list units --json` rows have fields `canonical, name, scope, plugin, path, description, shadowedBy, valid, errorCount, threshold, appliesWhen`.

ALWAYS pass `--file` to `check-judgment` and to `compare` — never pipe stdin. An idle socket stdin can hang the command forever, and a TTY stdin exits 2.

## 1. Choose the panelists

The user writes `/aska:panel [<panel> | <persona> <persona> …] : <question>`.

1. **Two or more persona names:** use exactly those.
2. **One name that is a saved panel** (`list panels --json`): use its personas. Add its notes to the brief. If the single name is `default` or `aska:default` and no such panel exists, say that `aska:default` is now `aska:ship`.
3. **No names, and a user or project `default` panel exists:** use it, and say "using your default panel (`<path>`)". The plugin ships no `default` panel. If that `default` panel is invalid, say so (with its path) and propose a lineup instead.
4. **No names otherwise, or the user asks in words for a suggestion** (for example "suggest a panel for …"): propose a lineup (step 1a) and wait for the user's reply. A request in words overrides even the user's own `default`. There is no `suggest` keyword; a persona or panel named `suggest` is just a name.

If fewer than 2 resolvable personas remain, stop and explain why. If that's because fewer than 2 personas exist at all, say there are no personas to put on a panel (or only one, naming it) and offer to build them with `/aska:author`. This applies to proposals too: never propose fewer than 2 candidates. Don't run a panel any other way.

### 1a. Propose a lineup

Look at the question, the subject type (see step 2), and a light view of the materials: for a change, the changed file list and a diffstat; for documents, their headings. Don't review them. Then read the catalog: `list personas --json`, `list panels --json` and `list units --json`.

Candidates are `list personas --json` rows with `valid: true`, `shadowedBy: null` and non-null `units`. Saved panels you may propose are `list panels --json` rows with `valid: true` and `shadowedBy: null`.

1. **Name the concerns.** Choose 2–5 units the question turns on, only from units some candidate holds. Use each unit's `appliesWhen` to rule it in or out.
2. **Cover them.** Every concern must be primary for at least one panelist. Choose the smallest set of personas that does this, between 2 and 6 personas.
3. **Make disagreement possible.** For the top concern, prefer adding a persona that holds it in a lower tier, deprioritizes it, or ranks it below a competing concern. Never seat two personas whose primary units are identical.
4. **Check the saved panels.** If one covers every concern as primary, propose it by name; it runs as that saved panel, with its notes. If one covers all but one or two concerns, propose it plus the missing personas; that run is ad-hoc (`panel: null`) and keeps the panel's notes in the brief. On a tie between panels, prefer project, then user, then plugin scope. Prefer `aska:code` over `aska:code-lean` unless the user says the branch will be squashed on merge, or its commit history isn't a concern; when you propose `aska:code`, mention that `aska:code-lean` is cheaper for a branch that will be squashed.
5. **Flag gaps.** If a concern that matters is primary for no candidate, say so and offer `/aska:author`. Never stretch a persona to cover a concern it doesn't hold.

Show the proposal in exactly this layout. Nothing launches until the user replies.

```
Question: "<the user's question, word for word>"
Concerns: <unit>, <unit>, …

Proposed panel:
  <persona> — <the concerns it holds, and their tiers>; <why it's here, if not obvious>
  <persona> — …

<Only if a saved panel was considered and not chosen: which one, and why not.>

Run this panel? Reply yes, edit it ("add …", "drop …"), or name a saved panel.
```

When the proposal is a saved panel, the header line is `Proposed panel: <name> (saved, <scope>)`, and the personas under it are the panel's own. Every reason names units from the catalog. Never preview what any panelist will conclude.

The user can accept, edit ("drop …", "add …", "swap X for Y"), or name a saved panel instead. Re-check an edited lineup: 2–6 panelists, each resolving. An edited saved panel runs ad-hoc (`panel: null`) and keeps that panel's notes in the brief. Launch a proposed saved panel's personas exactly as `list panels --json` lists them, and a new lineup's personas by `canonical`.

## 2. Write the brief

Create the run folder with `runs new`: it prints the folder's path, outside any git working tree, and the run is kept there after this session. If it fails, say the run won't be kept after this session and use `mktemp -d -t aska-panel-XXXXXX` instead. Write `brief.md` in the run folder. The brief is **identical for every panelist** and contains:

- **Question:** the user's question, word for word.
- **Subject:** one of `change`, `documents`, `conversation` or `none`.
- **Materials:** what to read, as file paths. Panelists can only read files.
  - For a diff, branch or PR, write the diff or PR content to files in the run folder and list them.
  - For a branch, PR or commit range, also write `git log --reverse --stat <base>..<head>` to `commits.txt` in the run folder and list it, so every panelist sees the commit history.
  - For any change, also write the list of tracked files at its head to `files.txt` in the run folder and list it: `git ls-tree -r --name-only <head>`, or `git ls-files` for uncommitted changes. When the head isn't what's on disk, add to the brief that the files on disk are another revision. Add this line to the brief: "The diff shows only the lines that changed. Open a file from `files.txt` when its whole content matters (fixtures, generated files), and use the list to see what's missing."
  - When that list has more than 1,500 paths, write a summary to `files.txt` instead, since a panelist reading a long file sees only its start. It begins with the line `This list is summarised: the repository has <n> tracked files.`, then has a per-directory count for the first two levels of folders, then every path the diff touches, and the other files in their directories (`git ls-tree --name-only <head> <dir>/` for each). Add to the brief: "`files.txt` is a summary, not every file: open a folder to see the rest."
  - When the diff bumps a dependency, also list its docs or type files, so panelists judge its use against its real interface: list the copies step 2a saved in `<dir>/deps/`, which come from the head's lockfile. When step 2a saved none, list those under `node_modules/<name>/` only when the installed version matches the head's lockfile; otherwise say in the brief that the installed docs are for another version.
  - For documents already in the repository, list their paths.
- **Panel notes:** the saved panel's notes, if any.
- **Checks:** for a change, `<dir>/checks.md` (step 2a), with this line: "These are the project's own checks, run once on the change's head commit. A record that says the checks didn't run or didn't finish is not a defect in the change."
- **Evidence:** only after an investigation (step 6), each evidence file's path and the check it answers, with this line: "Evidence is what the panel's investigations found. Weigh it as fact; don't ask to investigate it again unless its *Not determined* section leaves your question open."

For a **conversation** subject, write a neutral summary: the positions taken and decisions made, short quotes of key statements, and open questions. It must contain **no recommendation** and no hint of which way you lean.

### 2a. Run the checks first

For a `change` subject whose head commit exists (a branch, PR, commit or commit range, or uncommitted changes on top of a commit), run the project's checks once before launching the panel, so panelists judge with their result in hand instead of asking for it. You run them yourself, never in the user's checkout; panelists stay read-only. Skip this step for any other subject.

1. **Ask first for untrusted code.** Running the checks runs the change's code: if it comes from someone the user may not trust (a PR from a fork, for example), ask the user before running it. If they decline, record "checks didn't run: the user declined".
2. **Make a throwaway worktree** of the head commit. Run `mktemp -d /tmp/aska-checks-XXXXXX` and save the path it prints to `<dir>/checks-path.txt`; that path is `<checks>` below. Shell variables don't carry from one command to the next, so write the literal path into every later command, and never keep it in a fixed, shared file (such as `/tmp/aska-checks-path`): a panel running at the same time would overwrite it. Then run `git worktree add --detach <checks>/wt <head>`. For uncommitted changes, `<head>` is `HEAD`, and you apply them with `git diff HEAD | git -C <checks>/wt apply`; untracked files aren't included, and the record says so.
3. **Find the documented check command:** the one the README, contributing notes or `CLAUDE.md` give for checking a change, or else the manifest's `check` script. When there's no single check command, run every gate the project defines instead: each of the manifest's `typecheck`, `lint` and `test` scripts (and gates like them, such as `format:check`), plus any other the README's development section gives, never just `test`. If there is none, record "checks didn't run: no documented check command".
4. **Set up:** install dependencies there from the project's lockfile (for example `npm ci`, `uv sync`), installing only inside that worktree. If setup fails, record "checks didn't run: setup failed", with the setup command, its exit code and the last 40 lines of its output.
5. **Run the command once** in the worktree, with a limit of 10 minutes. With several gates, run every command, even after one fails, each with that limit. If one doesn't finish, record "checks didn't finish: stopped after 10 minutes", with the last 40 lines of its output.
6. **Save what the brief needs from the worktree** before cleaning it up, since it's gone afterwards. When the diff bumps a dependency, copy its docs and type files (its README, changelog and `.d.ts` files, for example) from the worktree's installed copy, such as `<checks>/wt/node_modules/<name>/`, to `<dir>/deps/<name>/`. Skip this when setup failed.
7. **Clean up**, even when a step failed: `git worktree remove --force <checks>/wt`, then delete `<checks>`. Remove only the path in this run's `<dir>/checks-path.txt`, never a glob such as `/tmp/aska-checks-*`, which would also catch another panel's worktree.
8. **Write `<dir>/checks.md`,** short and neutral, with no reading of your own:

   ```
   Commit: <full sha><, plus uncommitted changes (untracked files aren't included)>
   Setup: <install command> — exit <code>
   Command: <check command>
   Exit code: <code>
   Output (last 40 lines):
   <output>
   ```

   With several gates, repeat `Command:`, `Exit code:` and `Output (last 40 lines):` for each command, in the order they ran. When the checks didn't run or didn't finish, the record keeps the lines it has and says so in one line: `checks didn't run: <reason>` (or "didn't finish"). Tell the user when that happens.

## 3. Launch the panel

Say how many panelists will run and roughly what they will read. Don't ask for confirmation. A proposal the user accepted in step 1a already counts as confirmation.

For each panelist, get its prompt with `prompt <name> --panel`. Then launch every panelist at once: **all** the `aska:panelist` subagent calls **must** be in one message, one call per panelist. Never launch one panelist and wait for its reply before launching the next. Give each `aska:panelist` call the description `panelist <canonical>`, exactly. `<canonical>` is the `canonical` of the `list personas --json` row the name resolves to: a name with a `:` is already canonical; otherwise use the row with that `name` and `shadowedBy: null`. This applies to names the user typed and to a saved panel's `personas` alike. Each call's task is the persona prompt, then a line `---`, then the brief.

A panelist runs on the session's model unless the saved panel's `models` names it, or the user asked for a model for it (for example "historian on haiku"): then pass that model as the call's `model` parameter. Its re-ask and re-runs use the same model. Say which panelists run on another model when you say how many will run.

## 4. Collect and validate

For each reply, before saving it strip one surrounding code fence and nothing else, then save it to `<dir>/judgments/<name>.json` and run `check-judgment <name> --file <that file>` — pass the saved file with `--file`, never stdin.

- **Valid:** status `ok`.
- **Invalid:** re-ask once, with a fresh `aska:panelist` call containing the persona prompt, the brief, the previous reply, the violations, and an instruction to reply with the raw JSON object only — no code fence. If it is still invalid, status `malformed`, keeping the violations. The re-ask call's description is `panelist <canonical> re-ask`.
- **The subagent timed out or failed:** status `timeout` or `error`, with the exact reason, for example "timed out after 10 min".
- **A panelist marked `ok` whose persona no longer resolves:** `compare` demotes it to `error` with reason "persona does not resolve — fix the name before re-running". Don't blindly re-run that entry; fix the name yourself if you can tell what it should be, otherwise ask the user.

Write `<dir>/panel-result.json` as `{ "question", "panel", "panelists": [{ "persona", "status", "judgment"?, "violations"?, "reason"? }] }` — `panel` is the saved panel's name, or `null` for an ad-hoc panel — then run `compare --file <dir>/panel-result.json --json --record` — again with `--file`, never stdin. Pass `--record` on every compare of a folder from `runs new`: this one, and the ones after every re-run or investigation in step 6. With a `mktemp` folder, omit `--record`.

## 5. Report

Use only the comparison's facts. `compare --json` verdict rows use `null` for an absent `verdict`, `reason` or `tension`, never an absent key — read a `null` as "none", don't treat it as missing data. With fewer than 2 `ok` panelists, `compare --json` prints `ok: false` and exits 1 with no extra sentence in JSON mode; still report the verdicts and follow-ups below, just as you would with 2 or more.

Sections, in order:

1. **Header:** the panel name (or "ad-hoc"), the question and the panelists.
2. **Verdicts:** one line per panelist, including any that timed out, errored or were malformed, with the reason. When a verdict row has a `tension` (a `proceed` beside that panelist's own medium or higher finding, or its own finding of any severity in a primary security unit), print it after the verdict.
3. **Where they disagree:** `split` and `single-voice` units. One line per panelist: severity and tier with a one-line claim, or why it wasn't raised (not held, not reported with its threshold, cleared, not applicable).
4. **Where they agree:** `all-flag` units, and a count of units nobody raised.
5. **Outside their scope:** if any.
6. **Conditions, missing information and persona sections:** each attributed to its panelist.
7. **Follow-ups:** numbered. Re-runs first, then investigations with the tools each needs.
8. **Chair:** only when the user asks (for example "and recommend"), add `### Recommendation (chair — Claude's synthesis, not a panelist)`. Weigh the disagreements and propose a decision with reasoning. Never add a finding no panelist raised.
9. **Save offer:** only for an ad-hoc run (a proposed new lineup, an edited saved panel, or personas the user named), one line: `Save this lineup as a panel? Reply "save <name>".`
10. **Footer:** the run folder path. Don't delete the folder; follow-ups use it.

Every line of the report comes from `compare`'s output. **Follow-ups** lists exactly `compare`'s `followUps`, in order, one numbered line each — re-runs with their reason, investigations with their `what`, `why` and `tools` — and nothing else: don't merge, reword into new actions, or add your own. **Without a request for a recommendation, add no recommendation, "my read", or verdict of your own anywhere in the report**; the chair section is the only place Claude's view may appear.

Offer any panelist's full judgment on request.

## 6. Follow-ups

When the user picks a follow-up:

- **Re-run:** launch that persona alone, as `aska:panelist`, with the same brief and the same validation and re-ask. The re-run call's description is `panelist <canonical>`. Replace its entry in `panel-result.json` — never append, since the duplicate check is a literal string match and would count `p` and `acme:p` as two different panelists — run `compare` again (with `--record` on a kept run, as in step 4), and show the updated report.
- **Investigate:** run it on `aska:investigator`; never use `aska:panelist` for an investigation, since it has no tools. The investigator gathers evidence and doesn't judge, so one check serves the whole panel:
  1. **Group the checks.** Gather the picked items with every other `investigate` follow-up that asks for the same check, however it's worded. Launch one `aska:investigator` call per distinct check, all in one message, each with the description `investigator <n>`, where `<n>` is the number its evidence file will get. Each call's task is the brief, then a line `---`, then each grouped item's what, why and tools. Add nothing else to the task: no instructions of your own, not even to allow a change "somewhere safe", since the investigator's own rule is never to change anything. Never give it a persona prompt or any panelist's judgment: evidence gathered through one persona's eyes finds what that persona already fears. The user's normal permission prompts apply.
  2. **Check the evidence.** For each reply, strip one surrounding code fence and nothing else, save it to `<dir>/evidence/<n>.md` (numbering on from any evidence file already there, rejected ones included), and run `check-evidence --file <that file>`, with `--file`, never stdin.
     - **Valid:** add it to the brief's **Evidence:** list. Keep a reply whose *Not determined* section is all it has; that is evidence too.
     - **Invalid:** re-ask once, with a fresh `aska:investigator` call described as `investigator <n> re-ask`: the same task, then the previous reply, the violations, and an instruction to reply with only the four sections. Save the new reply over the same file and check it again.
     - **Still invalid, or the call timed out or failed:** don't add it to the brief, since every panelist would weigh it as fact. Rename any saved reply to `<dir>/evidence/<n>.rejected.md`, so it's kept to look at but never listed. Tell the user the investigation failed, with the violations or the exact reason (for example "timed out after 10 min"), and that the follow-up stays open to pick again.
  3. **Re-run every panelist**, whatever its status, with the updated brief, exactly as in steps 3 and 4: the brief stays identical for every panelist, so one panelist never judges on evidence another hasn't seen. Replace every entry in `panel-result.json`, run `compare` again (with `--record` on a kept run, as in step 4), and show the updated report, marking the units whose status changed. If no evidence was added, don't re-run the panel: nothing in the brief changed.

## 7. Save a lineup

When the user replies `save <name>` after an ad-hoc run:

1. **Ask where:** project scope (`.claude/personas/`, the default) or user scope (`~/.claude/personas/`). Never save into the plugin's own folder. If any panelist is a project-scope persona and the user picks user scope, say the panel won't resolve in other projects and ask before going on.
2. **Check the name.** It must be kebab-case. If `<name>.panel.md` already exists in that scope, stop and ask for another name; never overwrite. If the name would shadow a panel in another scope (`list panels --json`), say which one and ask before going on. If the name is `default`, say: "this will now run whenever you give no names."
3. **Write `<name>.panel.md`:** `name`; a `description` that generalizes the question into an "Is this …?" line, shown to the user to edit before writing; `personas` with each panelist's `canonical` from `list personas --json`; `models` for each panelist that ran on another model, keyed by that same `canonical`; and a body with the original saved panel's notes, if any.
4. **Validate:** run `validate` and report every diagnostic on the new file's path. If any is an error, delete the file and say why.

Never write a panel file without a `save` reply. Saving doesn't change the run folder or the report.
