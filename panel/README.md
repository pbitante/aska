# aska

Part of the [aska monorepo](../README.md); the Paseo editor is in [`paseo-plugin/`](../paseo-plugin/README.md).

A Claude Code plugin that lets you swap Claude's reviewing "personality" — the set of
concerns it weighs and how it prioritizes them — without changing the underlying model.
A persona is built from small, reusable **units** (rollback safety, cost, maintainability,
edge cases, …), each selected into a tier and optionally tuned. Two personas built from
mostly the same units but different tiers, thresholds and ordering will notice different
things about the same change.

This plugin covers the persona *model* (file formats, resolution and rendering, and a CLI
to check and generate from your persona files), a review panel that runs several personas
at once, and a starter set of units, personas and panels to start from.

## Install

Add this repo as a Claude Code marketplace, then install the plugin:

```
/plugin marketplace add pbitante/aska
/plugin install aska@aska
```

To work on a local clone, add it by path instead (`/plugin marketplace add /path/to/aska`), or
load the plugin folder for one session:

```
claude --plugin-dir /path/to/aska/panel
```

Either way, the plugin's own `personas/` directory becomes a plugin scope, available to
every project once the plugin is enabled. Once installed, its skills are invoked as
`/aska:operator`, `/aska:author`, `/aska:panel` and `/aska:gate`.

## Unit files

A unit is one concern, independent of any persona. It lives at
`personas/<name>.unit.md`, where `<name>` matches the file's own `name` field:

```markdown
---
name: rollback-safety
description: Can this change be undone quickly and safely if it goes wrong?
applies_when: The change is deployed, or alters persistent state, config, or external contracts.
threshold: medium
---

## Looks for
How the change would be reversed, and what can't be reversed
(data migrations, sent notifications, published APIs).

## Questions
- What is the rollback path, and has it been exercised?
- Does anything become irreversible once this ships?

## Red flags
- Destructive data migration with no backup or down-migration
- User-facing change shipped without a flag or kill switch

## Good looks like
A one-step revert or flag flip, with no data loss.
```

Frontmatter:

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | kebab-case ID; must equal the filename without `.unit.md` (or `.persona.md` for personas) |
| `description` | yes | one line, used verbatim for the condensed form in secondary/deprioritized tiers |
| `applies_when` | no | when the unit is relevant; lets a persona mark it not applicable instead of forcing a finding |
| `threshold` | yes | minimum severity at which the unit raises a finding: `low` < `medium` < `high` < `critical` |

Body: exactly the four `##` headings above, in any order — `Looks for` and `Good looks
like` are prose and cannot be overridden by a persona; `Questions` and `Red flags` are
bullet lists a persona can add to. No other `##` heading and no text before the first one.

## Persona files

A persona selects units into tiers, ranks them, and adds its own stance and judgment
shape. It lives at `personas/<name>.persona.md`:

```markdown
---
name: example
description: One line on what this persona weighs and why you'd use it.
extends: base-persona
model: sonnet
units:
  primary:
    - edge-cases
    - rollback-safety:
        threshold: low
        add_questions:
          - Has the rollback been run in staging?
  primary_order: [rollback-safety, edge-cases]
  secondary:
    - maintainability
    - acme-plugin:cost:
        threshold: high
  deprioritized:
    - code-style:
        note: Only raise style if it hides a bug.
  exclude:
    - scope-creep
overrides:
  stance: child
judgment:
  sections:
    - name: Suggested checks
      ask: Concrete checks that would catch the findings above.
capabilities:
  skills:
    - name: superpowers:test-driven-development
      when: proposing how to verify a fix
  mcp:
    - name: playwright
      when: checking user-facing behaviour
  tools: [Bash]
---

## Stance
How this persona approaches a problem (skeptical, advocating, pragmatic) and why.

## Tie-breaking
When its units conflict, which one wins and on what basis.

## Context
Any further `##` section is extra prose, rendered word for word under its own heading.
```

`model` (optional) is the model the persona's panelist runs on by default (see Panels).

### Tiers

- `primary` — rendered in full (looks for, questions, red flags, good-looks-like, threshold).
  Settable: `threshold`, `add_questions`, `add_red_flags`.
- `secondary` — one condensed line (description and threshold). Settable: `threshold`.
- `deprioritized` — one line telling the model to resist raising this unless critical.
  Settable: `note`. Its effective threshold is always `critical`.
- `exclude` — drops an inherited unit. Only valid with `extends`. No settings.

A unit reference is either bare (`edge-cases`) or namespaced to a plugin (`acme:cost`),
written as a plain list entry or as a single-key map to its settings.

### `extends` and overrides

A persona can `extend` one parent persona, inheriting everything it doesn't itself
override. When a child's own values clash with what it inherits, each clash gets an ID
(for example `rollback-safety.threshold`, `stance`, `code-style.tier`) and a default
winner — normally the more specific (child) side. `persona validate`/`explain` list every
clash; an unreviewed one shows the exact line to add:

```yaml
overrides:
  rollback-safety.threshold: child   # keep the child's value, mark it reviewed
  stance: parent                     # flip it: the inherited value wins instead
```

`overrides` is only valid together with `extends`, and only covers clashes produced by
that same file. A persona extending a plugin persona can't fix clashes declared inside
the plugin's own chain — the plugin's cached files aren't the user's to edit — so those
stay visible in the full report but don't force attention the way a user/project clash
does.

### Extra prose, judgment sections, capabilities

- `## Stance` and `## Tie-breaking` are the two named sections; any other `##` heading is
  extra prose, rendered word for word, identified by its heading text.
- `judgment.sections` adds persona-specific questions to the judgment contract (see
  below) — each has a `name` and an `ask`, and the name can't collide with a core heading
  (`Verdict`, `Findings`, `Cleared`, …) or another section, ignoring case.
- `capabilities` is optional and degrades gracefully: each declared `skills`/`mcp`
  capability is rendered as conditional text ("if it's available, use it when `<when>`;
  if it isn't, say so") rather than assumed present. `tools` is appended to the panel
  subagent's tool list; it grants no extra permission on its own.

### Judgment contract

Every rendered persona — swap style or panel subagent — can be asked for a judgment: a
verdict (`proceed`, `proceed-with-conditions`, `stop`, `insufficient-information`), a
finding per concern that's raised (unit, severity, claim, evidence), and coverage of
every primary unit across findings, `cleared`, or `not applicable`. Panel mode asks for
this as JSON; swap mode asks for markdown headings. A judgment validator
(`src/judgment/validate.ts`) checks replies against these rules.

## Starter units

This plugin ships 23 role-neutral units at `aska:<name>`, covering concerns most
reviews should weigh:

| Name | Concern |
|---|---|
| `data-integrity` | Could this corrupt, lose, or silently change stored data? |
| `rollback-safety` | Can this change be undone quickly and safely if it goes wrong? |
| `edge-cases` | Does the change handle unusual, empty, extreme, or concurrent inputs? |
| `security` | Can untrusted input, missing authorization, or leaked secrets expose data or actions? |
| `performance` | Will latency, throughput, and resource use hold up at realistic scale? |
| `maintainability` | Will the next person understand and change this easily? |
| `observability` | When this breaks in production, will anyone know, and be able to tell why? |
| `accessibility-ux` | Can every intended user perceive, understand, and operate this? |
| `user-value` | Does this make a real, noticeable difference to users soon? |
| `scope-creep` | Is the change doing more than the problem needs? |
| `delivery-speed` | Is anything here slowing down getting value to users without reducing real risk? |
| `cost` | What will this cost in money, quota, and infrastructure to build and run? |
| `test-evidence` | Is each behaviour the change claims proven by a test that would fail without it? |
| `privacy` | What personal data is collected, kept, logged, or sent off the device, and does the person it is about know? |
| `dependencies` | Do new or upgraded dependencies bring supply-chain, licence, pinning, or upkeep risk? |
| `plan-executability` | Can this plan be carried out exactly as written, step by step, without guessing? |
| `llm-behavior` | Does the model-driven feature fail safely when the model hallucinates, is manipulated, refuses, or meets a situation it shouldn't handle? |
| `eval-evidence` | Is the claimed quality of a model-driven feature backed by enough evaluations of the right kind? |
| `commit-history` | Does the branch's commit history tell a clean story that can be read, bisected and reverted one step at a time? |
| `necessity` | Does every class, layer, option and line earn its place? |
| `comment-noise` | Does each comment say something the code can't? |
| `spec-conformance` | Does the build do exactly what its spec says, including the contracts others rely on? |
| `release-readiness` | Is the repository ready to be published as it stands, files, fixtures and history included? |

Reference one as `aska:<name>` to pin it even if another plugin defines a unit with
the same bare name; define a user or project unit with the same name to replace it in
every persona that refers to it by that bare name.

## Starter personas and panels

The plugin also ships thirteen personas built from those units. Between them they cover all
23 units:

| Persona | Primary | Secondary | Deprioritized |
|---|---|---|---|
| `aska:guardian` | data-integrity, rollback-safety, edge-cases | scope-creep, user-value | — |
| `aska:accelerator` | user-value, delivery-speed, scope-creep | rollback-safety | edge-cases |
| `aska:maintainer` | security, release-readiness, maintainability, observability | performance, cost | delivery-speed |
| `aska:advocate` | user-value, accessibility-ux, edge-cases | scope-creep | cost |
| `aska:tester` | test-evidence, spec-conformance, edge-cases, maintainability | observability | delivery-speed |
| `aska:red-team` | security, privacy, dependencies | data-integrity, llm-behavior | delivery-speed |
| `aska:planner` | plan-executability, scope-creep, rollback-safety | test-evidence, delivery-speed | — |
| `aska:on-call` | observability, rollback-safety, performance | cost, data-integrity | maintainability |
| `aska:model-skeptic` | llm-behavior, eval-evidence, privacy | edge-cases, user-value | cost |
| `aska:ai-economist` | cost, performance, user-value | eval-evidence, delivery-speed | — |
| `aska:historian` | commit-history | scope-creep, rollback-safety | maintainability, edge-cases |
| `aska:trimmer` | necessity, comment-noise, scope-creep | maintainability, test-evidence | observability |
| `aska:gate` | security, data-integrity, spec-conformance, edge-cases, test-evidence | privacy, llm-behavior, rollback-safety, dependencies, performance | maintainability, scope-creep |

And seven panels:

| Panel | For | Personas |
|---|---|---|
| `aska:ship` | Should this ship? | guardian, accelerator, maintainer |
| `aska:code` | Code changes and PRs | guardian, tester, red-team, maintainer, historian |
| `aska:code-lean` | Code changes on a branch that will be squashed on merge: one panelist fewer, so cheaper | guardian, tester, red-team, maintainer |
| `aska:plan` | Plans and specs, before executing them | planner, guardian, accelerator |
| `aska:llm` | Prompts, models and other model-driven features | model-skeptic, ai-economist, red-team |
| `aska:ops` | Deploying, watching and undoing a change | on-call, guardian, maintainer |
| `aska:trim` | Is this change bigger than it needs to be? | trimmer, maintainer, guardian |

Renamed in 0.2.0: `aska:default` is now `aska:ship`, and the plugin ships no `default` panel.

`/aska:panel : <question>` proposes a lineup for the question and runs it once you confirm;
`/aska:panel code : <question>` picks a per-use panel. Starter personas refer to units as
`aska:<name>`, so your own units never change them. A user or project persona or panel with
the same name shadows the shipped one.

## Scopes and paths

Personas and units are looked up across three layered scopes, most specific first:

| Scope | Root | Example persona path |
|---|---|---|
| Project | the nearest `.claude/` above the working directory, stopping at the git root | `.claude/personas/reviewer.persona.md` |
| User | `~/.claude/` | `~/.claude/personas/reviewer.persona.md` |
| Plugin | each enabled plugin's install path | `<install-path>/personas/reviewer.persona.md` |

A bare name resolves to the most specific scope that defines it; a name defined by more
than one plugin (and by no user or project file) is ambiguous and must be namespaced as
`<plugin>:<name>`. The canonical form — used in clash IDs and `overrides` keys — is the
bare name for user/project files and `<plugin>:<name>` for plugin files.

A scope's `personas/` folder is not scanned recursively, and any `*.md` file there that
isn't named `<name>.persona.md` or `<name>.unit.md` is left alone and reported as
`W_UNTYPED_FILE` rather than silently ignored or misread.

If this plugin is both installed from a marketplace and loaded for development with
`--plugin-dir`, the installed copy's starter units win: the dev copy's own plugin scope is
only added when `claude plugin list` doesn't already report an `aska` plugin. Developers
running both at once will see the installed copy's starter units, not the ones next to
their checkout.

## CLI

The CLI is bundled as `skills/operator/scripts/persona.mjs` and wrapped by the
`operator` skill. There is no `persona` command on your `PATH`: the table's `persona` stands
for `node <plugin>/skills/operator/scripts/persona.mjs`, where `<plugin>` is your checkout or
the plugin's install path. Run it from your project directory so the project scope is
found:

| Command | Does |
|---|---|
| `persona validate` | checks every persona, unit and panel in every scope, and reports stale generated files |
| `persona validate <name>` | checks one persona, including a stale-render check for just that persona |
| `persona explain <name>` | prints the effective persona, the clash report and the rendered prompt |
| `persona render <name> [--scope project\|user]` | writes the output style and panel subagent for a persona |
| `persona list [units\|personas\|panels] [--json]` | lists every unit, persona and panel in every scope; `--json` for machine-readable output (persona rows include `units`, the persona's resolved units by tier, and `model`) |
| `persona prompt <name> --panel [--checks <targets.json>]` | prints a persona's panel prompt; with `--checks`, it also lists the review targets and the `checks` contract |
| `persona check-judgment <name> [--file <path>] [--checks <targets.json>]` | validates a judgment (read from `<path>` or stdin) against a persona's contract, and against the targets when `--checks` is given |
| `persona check-evidence [--file <path>]` | validates an investigator's evidence (markdown, read from `<path>` or stdin): its four sections, in order, each with content |
| `persona compare [--file <path>] [--json] [--record]` | compares a panel's judgments (panel-result JSON, read from `<path>` or stdin) and reports agreement, disagreement and follow-ups; `--record` also updates the `meta.json` of the kept run that holds `<path>` |
| `persona lineup --json [--model <m>] <names…>` | resolves a lineup (a saved panel, optionally with `<member>@<m>` tags, or 2 to 6 personas, each optionally `@<m>`) into the panelists to launch and the model each runs on, with where the model came from |
| `persona runs new` | creates a kept panel-run folder under `~/.claude/aska/runs/<id>/` (or `$ASKA_RUNS_DIR/<id>/`) with its `meta.json` and prints its path |
| `persona runs list [--json]` | lists kept panel runs, newest first; `--json` gives each run's `meta.json` plus its `path` |
| `persona targets --from <file.md> [--out <targets.json>]` | extracts a step file's `## Adversarial review targets` as numbered targets (`T1`, `T2.1`, …) |
| `persona gate [<name>] --file <judgment.json> --checks <targets.json> [--json]` | decides a gate judgment, validated against persona `<name>` (default `gate`) whatever persona the judgment names: `pass`, `pass-with-conditions` or `fail` (exit 1); exit 2, with no result, when either file can't be read |
| `persona show <kind> <name> [--scope project\|user\|plugin] [--json]` | prints one unit, persona or panel file as data: fields as written, sections, raw text and a content hash |
| `persona save <kind> <name> --scope project\|user --file <md> [--expect-hash <h>] [--json]` | checks a whole file as if it were already in place, then writes it; refuses on errors |
| `persona patch <kind> <name> --scope project\|user --file <json> [--expect-hash <h>] [--json]` | applies form edits (`set`, `unset`, `sections`) to a file or a new one, keeping everything it doesn't touch, then checks and writes it |
| `persona delete <kind> <name> --scope project\|user [--force] [--expect-hash <h>] [--json]` | removes a file; lists what would break and refuses unless `--force` |

A write command never writes into a plugin, checks every file as if it were already in place
before touching disk, and takes `--expect-hash` (from `show`, or `none` for a new file) so an
edit made elsewhere in the meantime is refused with `E_STALE` instead of overwritten or deleted
(`delete` takes the hash from `show`, never `none`). Nothing is locked, though: two writers
racing on the same file can still lose an edit. In the user scope, a write follows a symlinked file (a
dotfiles setup) and keeps the link; in the project scope it only follows a link that stays
inside the project, so a cloned repository can't aim a write at your own files.

The panel skill keeps every run in `~/.claude/aska/runs/<id>/`, never inside a git working tree: the
brief, the materials, each judgment, `panel-result.json` and a `meta.json` (project, question,
panel, panelists' verdicts, when it started and was last compared). If that folder would sit inside
any repository or worktree, `runs new` refuses with `E_RUNS_IN_REPO`. That includes a home tracked
by a bare dotfiles repository (`git --git-dir=~/.dotfiles --work-tree=~`): a bare repository kept
directly in the store's folder or any folder above it, under any name, that has an `index` (it has
been used with a work tree) is taken to track the folder it sits in, or its `core.worktree` if it sets
one; a bare repository with no `index`, such as a mirror or a backup clone, tracks nothing. A store
inside `$GIT_WORK_TREE`, or inside the `core.worktree` of `$GIT_DIR`, is refused too.

To move the store, set `ASKA_RUNS_DIR` in the environment Claude Code runs in to an absolute path
outside every git working tree: runs then go in `$ASKA_RUNS_DIR/<id>/`, and `runs list` reads them
from there. It must be absolute and, if it exists, a folder you own; otherwise `runs new` and
`runs list` fail with `E_RUNS_DIR`. It's created if missing, kept owner-only and checked by the same
guard. An empty value counts as unset. Alternatively, move `~/.claude/aska/runs` to a folder outside
any git working tree and symlink it back at `~/.claude/aska/runs`, or set `PERSONA_HOME` to a home
outside every git working tree (runs then go in `$PERSONA_HOME/.claude/aska/runs`) — the latter also
moves your user-scope personas and units, since `PERSONA_HOME` is the CLI's whole home, not just the
run store. The store and each run folder are owner-only (0700). A run folder kept before 0.6.1 may
be looser; it's tightened the next time `compare --record` updates it. Nothing prunes them; delete a folder
to remove a run.

Exit code `0` means no errors, `1` means errors were reported, `2` means the command line
itself was wrong.

For example, `persona list units` prints every unit across every scope, grouped by scope
and marked with its threshold, shadowing and validity.

## Generated files and restart

`render` writes two files per persona: an output style (`<scope-root>/output-styles/`)
and a panel subagent definition (`<scope-root>/agents/`), each named `<name>.persona.md`
for a user or project persona, or `<plugin>--<name>.persona.md` for a plugin persona (a
subagent name can't contain `:`). Their frontmatter `name:` is `<name>-persona` or
`<plugin>--<name>-persona`. Each starts with a generated-file marker naming its source
persona and a hash of every input file; `persona validate` reports a **stale render**
once that hash no longer matches, and `render` refuses to overwrite a file that doesn't
have the marker (so a hand-edited file is never clobbered). It also refuses to write when
either path is a symlink, so a repository can't point a project path at your own files.

Claude Code only reads output styles at startup, so **restart Claude Code** after
rendering a new or changed persona before selecting it.

## Writing a persona

Invoke `/aska:author` (or just ask Claude to "write a persona that…") to draft a
persona or unit with the `author` skill:

- It drafts first and interviews second: after a question or two about what the persona is
  for, it proposes a complete tiering, stance and tie-breaking rule for you to edit, rather
  than asking a long list of questions up front.
- It prefers the 23 starter units and existing project/user units over writing new ones, and
  only drafts a new unit when no existing one covers the concern.
- It only ever writes to `.claude/personas/` or `~/.claude/personas/`, never into a plugin's
  own install path; tuning a plugin persona creates a child that extends it instead of
  editing it in place.

## Panels

A panel runs several personas as parallel, read-only reviewers over the same question
and reports where and why they disagree. Invoke it with `/aska:panel`:

```
/aska:panel guardian accelerator : Is this migration safe to ship?
/aska:panel ship : Is this migration safe to ship?
/aska:panel : Is this migration safe to ship?
/aska:panel --model sonnet code : Is this migration safe to ship?
/aska:panel code tester@sonnet : Is this migration safe to ship?
```

- Naming two or more personas runs exactly those.
- Naming a saved panel runs its personas and adds its notes to the brief.
- Naming nothing runs your own `default` panel if you have saved one. Otherwise it
  proposes a lineup (the concerns the question turns on, and the personas that hold
  them) and waits for you to confirm or edit it. Ask "suggest a panel for …" to get a
  proposal even when you have a `default`.

After an ad-hoc run, the report offers to save the lineup: reply `save <name>` and it writes
`<name>.panel.md` to your project (or user) personas folder. It never overwrites an existing
panel, and it warns you before shadowing one from another scope.

Each panelist runs on the first model that applies: the per-run model, then the saved panel's `models`, then the persona's `model`, then your session's model. The per-run model is `<persona>@<m>` (or `<panel> <member>@<m>`, or "tester on sonnet"), then `--model <m>` for everyone. The report tags each panelist's model whenever any of them ran on a named one, so a split between models is visible. Runs made before 0.8.0 show no models.

A panel never runs with fewer than 2 personas; for a single persona, use `/aska:operator`
or `/aska:author` instead.

### Panel files

A saved panel lives at `personas/<name>.panel.md`, in the same scopes and with the same
shadowing as a persona:

```markdown
---
name: review
description: Reads and writes the change together.
personas: [reader, writer]
models:
  writer: sonnet
---

Any prose here is added to the brief as the panel's notes.
```

`personas` lists 2 to 6 persona references (bare or `plugin:name`); listing the same
persona twice, even under different spellings that both resolve to it, is an error.
`models` is optional: it runs a listed persona's panelist on a model alias such as `haiku`, `sonnet` or `opus`
instead of your session's model, to make a panel cheaper. These are model aliases the Agent
tool accepts. Name the persona exactly as
`personas` lists it. You can also ask for one run, for example
`/aska:panel code historian@haiku : …`.

### The report

The report always has, in order: a header naming the panel and question; **Verdicts**
(one line per panelist, including any that timed out, errored or came back malformed);
**Where they disagree** and **Where they agree**, unit by unit; anything flagged outside
the panel's scope; conditions, missing information and persona-specific sections; and
numbered **Follow-ups** (re-runs first, then investigations). Asking for a recommendation
adds a final chair section that weighs the disagreement — it's Claude's own synthesis,
never attributed to a panelist, and never introduces a finding no panelist raised.

### Follow-ups

Picking a re-run relaunches that persona alone and replaces its entry in the panel
result. Picking an investigation runs the `aska:investigator` subagent to check something
a panelist flagged but couldn't verify itself. It has no persona and doesn't judge: it
runs the check once, even when several panelists asked for it, and writes what it found
as evidence. `check-evidence` checks the evidence's shape, with one re-ask; evidence that
still fails, or an investigation that errors, never reaches the panel, and the follow-up
stays open. Valid evidence joins the brief, and the whole panel re-runs on it so every
panelist judges on the same facts. The investigator can use every tool except the file
editors, the Agent and Workflow tools (so it can't launch a subagent that has them), and the
tools that act outside the session: messaging another session (which could act without your
permission prompts), remote triggers, scheduled jobs and wake-ups, worktrees, stopping other
tasks, and notifications. The list names tools, so a tool Claude Code adds later is allowed
until aska lists it. That
still leaves tools that can change things, such as Bash and any MCP server you have
connected: only its instructions and your normal permission prompts keep it from using
them that way, and on a branch or PR, "run the tests" runs that branch's code. Before you
investigate a PR from someone you don't trust, run Claude Code in a disposable container or VM.

Panelists themselves are read-only (`Read`, `Grep`, `Glob`) and can't run commands or
query systems — anything that needs a tool they don't have comes back as an
`investigate` item on the judgment instead of a guess, and becomes a follow-up.

On any change (a branch, PR, commit range or uncommitted changes), whatever the panel, Claude
runs the project's documented check command once before the panelists start (or, when there's
no single one, every gate it defines, such as its `typecheck`, `lint` and `test` scripts), in a throwaway
worktree of the head commit under `/tmp` with dependencies installed there, never in your
checkout, and removes the worktree afterwards. Each run keeps that worktree's path in its own
run folder and removes only that path, so panels running at the same time never touch each
other's worktrees. Before removing it, Claude copies the docs of any dependency the change
bumps from the worktree's install into the run folder. Panelists get a short record: each
command, its exit code and the last 40 lines of output. A run that couldn't happen (no documented checks,
a failed install, over 10 minutes) is recorded as just that, not as a defect. This adds the
time of an install and a check run to every change panel, but no extra agent. It runs the
change's code, so Claude asks before running a change from someone you may not trust. The brief also lists every tracked file (`files.txt`), so
panelists can open files the diff doesn't show and notice ones that are missing. Above 1,500
files the list is a summary: counts per folder, plus the changed files and their neighbours.
In the report, a `proceed` verdict that stands beside the same panelist's own medium or
higher finding, or its own finding of any severity in a security unit it holds as primary, is
marked, so an under-weighted finding doesn't pass unnoticed.

## Gate

`/aska:gate <step-file> [<base>..<head>] [--records <dir>] [--model <m>]` runs the independent adversarial review at the end
of a build step. A step file is a markdown file describing one build step. The gate needs only
its `## Adversarial review targets` section, a bullet list of what to attack; an
`## Implementation check` section (a code block of commands the reviewer may run) and a
`**Spec:**` line pointing at the spec are optional. The gate answers every target, then reviews
the change through its own concerns.

1. `persona targets --from <step-file>` numbers the targets: each top-level bullet is `T1`,
   `T2`, …, and each nested bullet is `T<n>.<k>`. Bullets and headings inside fenced code
   blocks are ignored, tab indentation counts as nesting, prose never detaches a nested
   bullet, and empty bullets and thematic breaks are skipped. A `###` heading, or a numbered
   list that starts at `1.` or `1)` at the left margin, ends the bullet above it, so such a
   list is prose, not targets. A wrapped line that only begins with another number (`3. …`)
   stays part of its target, and a numbered line indented under a bullet continues that
   bullet.
2. One fresh reviewer (Opus by default) judges the change as `aska:gate`, from a neutral brief (the step
   file, its spec, the diff and the commits), with the targets in its prompt
   (`persona prompt gate --panel --checks targets.json`). It may run the step's implementation
   check, in a throwaway worktree. Like the investigator, it runs as its own subagent,
   `aska:gate-reviewer`, which has every tool except the file editors, the Agent and Workflow tools and the
   tools that act outside the session. Bash stays, because the gate runs commands: its
   instructions and your permission prompts keep it out of your checkout, and it runs the
   branch's code, so gate untrusted changes only in a disposable container or VM.
   Pass `--model <m>` to run the gate on another model, or set `model:` on your own `gate` persona.
3. Its judgment answers each target in `checks` — `holds`, `broken` (tied to a finding with
   `check`), or `deferred` (with `needs`: a device, production data, a person) — and
   `persona check-judgment gate --checks targets.json` validates that every target is
   answered exactly once.
4. `persona gate` validates the judgment against the `gate` persona (or the persona you name),
   never against the persona the judgment claims, and decides:

| Result | When | What happens next |
|---|---|---|
| `fail` | the judgment is invalid, a target is `broken`, or the verdict is `stop` or `insufficient-information` | fix, then run the gate again with a fresh reviewer |
| `pass-with-conditions` | the verdict is `proceed-with-conditions`, or a target is `deferred` | fix and record the conditions; deferred targets wait for a manual check |
| `pass` | the verdict is `proceed` and every target `holds` | the next step can start |

With your OK, the skill saves a numbered `targets-<n>.json` and `judgment-<n>.json` under
`.claude/aska/gates/<step>/` in your project (or the folder you pass with `--records <dir>`, or
name when it asks), and prints a one-line summary to paste wherever you track what was
verified (a traceability file, the plan, a PR description). Commit the folder to keep
the record with the code, or ignore it in git if you don't want it shared. A judgment can
quote the output of the commands the reviewer ran, so read it before you commit it. Targets are
saved per run, so an earlier record stays re-checkable even after the step file's targets change.
A saved record can be re-checked at any time with `persona gate --file … --checks …`.

Count the deferred targets. Deferral has no limit, and a setup failure (dependencies that
won't install, say) also defers the targets it blocks, so a `pass-with-conditions` where most
targets are deferred verified little.

A finding tied to a target is in scope by definition: it may name any of the persona's
concerns, or `outside-scope`, at any severity. Without `--checks`, `checks` and `check` are
not allowed, so panel judgments are unchanged.

## Development

You need Node 22 or later. Run these from `panel/`: `npm ci` installs the tools, and `npm run check` runs the
typecheck, the tests, a smoke test of the bundled CLI, and the build. The CLI's TypeScript
lives in `src/`; `skills/operator/scripts/persona.mjs` is built from it by `npm run build` and
committed, so the plugin works without an install step. Rebuild and commit it with any change
to `src/`: `npm run check` fails if the committed bundle doesn't match.

## Evals

A separate, non-deterministic eval suite checks that contrasting personas actually notice
different things, with a self-pair control so a persona-blind model can't pass by chance.
It costs money to run and is not part of CI — see `evals/README.md` for how to run it and
read the results, `evals/author/README.md` for the suite that checks the
`author` skill itself, and `evals/panel/README.md` for the suite that checks the `panel`
skill, and `evals/gate/README.md` for the hand-run check of the `gate` skill.

## Licence

GPL-3.0-or-later, see [`LICENSE`](../LICENSE).
