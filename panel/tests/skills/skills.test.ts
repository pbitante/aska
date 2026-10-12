import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../src/parse/frontmatter';

// The investigator and gate reviewer keep Bash, so they run on a denylist. A denylist lets through
// any tool Claude Code adds later, so this list is pinned exactly: when Claude Code gains a tool that
// edits files, launches agents or acts outside the session, add it here and to both agents.
const DENIED_TOOLS = [
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Agent', 'Workflow', 'SendMessage', 'RemoteTrigger',
  'CronCreate', 'CronDelete', 'ScheduleWakeup', 'EnterWorktree', 'ExitWorktree', 'TaskStop', 'PushNotification',
];

const repo = fileURLToPath(new URL('../..', import.meta.url));

describe('plugin packaging', () => {
  it('is named aska', () => {
    expect(JSON.parse(readFileSync(join(repo, '.claude-plugin/plugin.json'), 'utf8')).name).toBe('aska');
  });

  it('ships the operator skill with the bundle', () => {
    const path = join(repo, 'skills/operator/SKILL.md');
    const fm = splitFrontmatter(path, readFileSync(path, 'utf8')).fm!;
    expect(fm.data.name).toBe('operator');
    expect(String(fm.data.description)).toMatch(/validate/i);
    expect(existsSync(join(repo, 'skills/operator/scripts/persona.mjs'))).toBe(true);
    expect(existsSync(join(repo, 'skills/persona'))).toBe(false);
  });

  it('documents the list command including panels in README.md and the operator skill', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    expect(readme).toContain('persona list [units\\|personas\\|panels] [--json]');
    expect(readme).toContain('lists every unit, persona and panel in every scope');
    const operator = readFileSync(join(repo, 'skills/operator/SKILL.md'), 'utf8');
    expect(operator).toContain('list [units\\|personas\\|panels] [--json]');
    expect(operator).toContain('show every unit, persona and panel in every scope');
  });

  it('tells upgraders that aska:default is now aska:ship', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    expect(readme).toContain('Renamed in 0.2.0: `aska:default` is now `aska:ship`, and the plugin ships no `default` panel.');
  });

  it('documents the authoring commands in README.md and the operator skill', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    const operator = readFileSync(join(repo, 'skills/operator/SKILL.md'), 'utf8');
    for (const cmd of ['show <kind> <name>', 'save <kind> <name>', 'patch <kind> <name>', 'delete <kind> <name>']) {
      expect(readme, cmd).toContain(`persona ${cmd}`);
      expect(operator, cmd).toContain(cmd);
    }
    expect(readme).toContain('never writes into a plugin');
  });

  it('documents check-evidence in README.md and the operator skill', () => {
    expect(readFileSync(join(repo, 'README.md'), 'utf8')).toContain('persona check-evidence [--file <path>]');
    expect(readFileSync(join(repo, 'skills/operator/SKILL.md'), 'utf8')).toContain('check-evidence [--file <path>]');
  });

  it('documents kept panel runs in README.md and the operator skill', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    const operator = readFileSync(join(repo, 'skills/operator/SKILL.md'), 'utf8');
    for (const s of ['runs new', 'runs list [--json]', '--record']) {
      expect(readme, s).toContain(s);
      expect(operator, s).toContain(s);
    }
    expect(readme).toContain('~/.claude/aska/runs/');
    expect(readme).toContain('Nothing prunes them');
  });

  it('is version 0.7.1 everywhere', () => {
    expect(JSON.parse(readFileSync(join(repo, '.claude-plugin/plugin.json'), 'utf8')).version).toBe('0.7.1');
    expect(JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version).toBe('0.7.1');
    const lock = JSON.parse(readFileSync(join(repo, 'package-lock.json'), 'utf8'));
    expect([lock.version, lock.packages[''].version]).toEqual(['0.7.1', '0.7.1']);
  });

  it('documents the gate commands and --checks in the operator skill', () => {
    const operator = readFileSync(join(repo, 'skills/operator/SKILL.md'), 'utf8');
    for (const cmd of [
      'prompt <name> --panel [--checks <targets.json>]',
      'check-judgment <name> [--file <path>] [--checks <targets.json>]',
      'targets --from <file.md> [--out <targets.json>]',
      'gate [<name>] --file <judgment.json> --checks <targets.json> [--json]',
    ]) expect(operator, cmd).toContain(cmd);
  });

  it('documents the gate commands, the result rule and the gate eval', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    expect(readme).toContain('persona targets --from <file.md> [--out <targets.json>]');
    expect(readme).toContain('persona gate [<name>] --file <judgment.json> --checks <targets.json> [--json]');
    expect(readme).toContain('persona prompt <name> --panel [--checks <targets.json>]');
    expect(readme).toContain('## Gate');
    expect(readme).toContain('| `fail` |');
    expect(readme).toContain('| `pass-with-conditions` |');
    expect(readme).toContain('evals/gate/README.md');
    expect(existsSync(join(repo, 'evals/gate/make-fixture.mjs'))).toBe(true);
  });
});

describe('author skill', () => {
  const dir = join(repo, 'skills/author');
  const skillPath = join(dir, 'SKILL.md');

  it('has valid frontmatter that triggers on authoring', () => {
    const fm = splitFrontmatter(skillPath, readFileSync(skillPath, 'utf8')).fm!;
    expect(fm.data.name).toBe('author');
    expect(String(fm.data.description)).toMatch(/write|create|design/i);
    expect(String(fm.data.description)).toMatch(/tune|adjust/i);
  });

  it('links every reference file, and they exist', () => {
    const text = readFileSync(skillPath, 'utf8');
    for (const f of ['formats.md', 'choosing-units.md', 'writing-units.md', 'voice.md']) {
      expect(text).toContain(`reference/${f}`);
      expect(existsSync(join(dir, 'reference', f))).toBe(true);
    }
  });

  it('runs the operator bundle and never writes into the plugin', () => {
    const text = readFileSync(skillPath, 'utf8');
    expect(text).toContain('../operator/scripts/persona.mjs');
    expect(text).toMatch(/never (write|edit).*plugin/i);
  });

  it('stops before running if the operator CLI is missing, naming the aska plugin', () => {
    const text = readFileSync(skillPath, 'utf8');
    expect(text).toContain('check that `<base directory>/../operator/scripts/persona.mjs` exists');
    expect(text).toContain('This skill must be used from the aska plugin (its operator skill and CLI are missing)');
  });

  it('keeps a stated scope, and never saves outside the persona folders when a write is denied', () => {
    const text = readFileSync(skillPath, 'utf8');
    expect(text).toMatch(/already (named|stated|gave) (a|the) scope/i);
    expect(text).toMatch(/otherwise ask/i);
    expect(text).toMatch(/denied/i);
    expect(text).toMatch(/never save .*anywhere else/i);
  });

  it('step 8 limits automatic fixes to files written this session, and reports other warnings instead of acting on them', () => {
    const text = readFileSync(skillPath, 'utf8');
    expect(text).toMatch(/fix,? without asking,? only the errors and warnings on the files you wrote this session/i);
    expect(text).toMatch(/report any other warning.*to the user instead of acting on it/i);
  });

  it('reference files describe the current layout, not the old one', () => {
    for (const f of ['formats.md', 'choosing-units.md', 'writing-units.md', 'voice.md']) {
      const text = readFileSync(join(dir, 'reference', f), 'utf8');
      expect(text).not.toMatch(/personas\/(personas|units)\//);
    }
    expect(readFileSync(join(dir, 'reference/formats.md'), 'utf8')).toContain('.persona.md');
  });

  it('has no leftover skill names from earlier renames', () => {
    const files = [
      join(repo, 'skills/operator/SKILL.md'),
      skillPath,
      ...['formats.md', 'choosing-units.md', 'writing-units.md', 'voice.md'].map((f) => join(dir, 'reference', f)),
    ];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text).not.toMatch(/\bpersona:[a-z]/);
      expect(text).not.toContain('persona-operator');
      expect(text).not.toContain('persona-author');
      expect(text).not.toContain('aska-operator');
      expect(text).not.toContain('aska-author');
    }
  });
});

describe('aska:panelist agent', () => {
  const path = join(repo, 'agents/panelist.md');

  it('is a read-only subagent that returns only judgment JSON', () => {
    const fm = splitFrontmatter(path, readFileSync(path, 'utf8')).fm!;
    expect(fm.data.name).toBe('panelist');
    expect(String(fm.data.description)).toMatch(/panel/i);
    expect(String(fm.data.tools).split(',').map((t) => t.trim())).toEqual(['Read', 'Grep', 'Glob']);
    const body = readFileSync(path, 'utf8');
    expect(body).toMatch(/only the judgment JSON/i);
    expect(body).toContain('investigate');
  });

  it('reads only the materials the brief lists, and adopts the persona prompt fully', () => {
    const body = readFileSync(path, 'utf8');
    expect(body).toContain('Read only the materials the brief lists');
    expect(body).toContain('Adopt it fully');
  });
});

describe('aska:investigator agent', () => {
  const path = join(repo, 'agents/investigator.md');

  it('inherits every tool but the file editors and the tools that act outside the session, so a check is never short of a tool it asks for', () => {
    const fm = splitFrontmatter(path, readFileSync(path, 'utf8')).fm!;
    expect(fm.data.name).toBe('investigator');
    expect(String(fm.data.description)).toMatch(/investigate/i);
    expect(fm.data.tools).toBeUndefined();
    expect(String(fm.data.disallowedTools).split(',').map((t) => t.trim())).toEqual(DENIED_TOOLS);
  });

  it('gathers evidence without judging or changing anything', () => {
    const body = readFileSync(path, 'utf8');
    expect(body).toMatch(/no persona/i);
    expect(body).toMatch(/don't judge/i);
    expect(body).toMatch(/never change/i);
    for (const h of ['## Checked', '## Ran', '## Found', '## Not determined']) expect(body).toContain(h);
  });

  it('asks for the evidence alone, with every section filled', () => {
    const body = readFileSync(path, 'utf8');
    expect(body).toMatch(/no preamble and no code fence/i);
    expect(body).toMatch(/write "Nothing" in any section that has nothing to say/i);
  });

  it('is environment-agnostic', () => {
    expect(readFileSync(path, 'utf8')).not.toMatch(/herdr|orca|paseo/i);
  });
});

describe('aska:gate-reviewer agent', () => {
  const path = join(repo, 'agents/gate-reviewer.md');

  it('runs on opus with every tool but the file editors and the tools that act outside the session', () => {
    const fm = splitFrontmatter(path, readFileSync(path, 'utf8')).fm!;
    expect(fm.data.name).toBe('gate-reviewer');
    expect(String(fm.data.description)).toMatch(/gate/i);
    expect(fm.data.model).toBe('opus');
    expect(fm.data.tools).toBeUndefined();
    expect(String(fm.data.disallowedTools).split(',').map((t) => t.trim())).toEqual(DENIED_TOOLS);
  });

  it('adopts the persona prompt, never changes the checkout, and defers instead of investigating', () => {
    const body = readFileSync(path, 'utf8');
    expect(body).toMatch(/adopt it fully/i);
    expect(body).toMatch(/never change the user's checkout/i);
    expect(body).toMatch(/don't use `investigate`/i);
    expect(body).toMatch(/`deferred` target with `needs`/i);
  });

  it('returns the judgment JSON alone', () => {
    expect(readFileSync(path, 'utf8')).toMatch(/only the judgment JSON[^\n]*no code fence/i);
  });

  it('is environment-agnostic', () => {
    expect(readFileSync(path, 'utf8')).not.toMatch(/herdr|orca|paseo/i);
  });
});

describe('panel skill', () => {
  const path = join(repo, 'skills/panel/SKILL.md');
  const text = () => readFileSync(path, 'utf8');

  it('has frontmatter naming it panel', () => {
    const fm = splitFrontmatter(path, text()).fm!;
    expect(fm.data.name).toBe('panel');
    expect(String(fm.data.description)).toMatch(/panel/i);
  });

  it('guards for the operator bundle and uses only real CLI commands', () => {
    const t = text();
    expect(t).toContain('../operator/scripts/persona.mjs');
    expect(t).toContain('This skill must be used from the aska plugin');
    for (const cmd of ['list personas --json', 'list panels --json', 'list units --json', 'prompt <name> --panel', 'check-judgment <name> --file', 'check-evidence --file', 'compare --file']) expect(t).toContain(cmd);
  });

  it('writes the commit history of a branch, PR or commit range into the brief', () => {
    expect(text()).toContain('also write `git log --reverse --stat <base>..<head>` to `commits.txt` in the run folder and list it');
  });

  it('lists every tracked file for a change, and says the diff shows only changed lines', () => {
    const t = text();
    expect(t).toContain('`files.txt`');
    expect(t).toContain('git ls-files');
    expect(t).toMatch(/the diff shows only the lines that changed/i);
  });

  it('summarises files.txt above 1,500 paths, keeping the changed paths and their siblings, and says so in the brief', () => {
    const t = text();
    expect(t).toMatch(/more than 1,500 paths/);
    expect(t).toContain('This list is summarised');
    expect(t).toMatch(/per-directory count/);
    expect(t).toMatch(/every path the diff touches, and the other files in their directories/);
    expect(t).toMatch(/files\.txt` is a summary/);
  });

  it('lists a bumped dependency\'s docs only when the installed version is the head\'s', () => {
    expect(text()).toMatch(/only when the installed version matches the head's lockfile/);
  });

  it('keeps models when saving a lineup', () => {
    const t = text();
    const step = t.slice(t.indexOf('## 7. Save a lineup'));
    expect(step).toMatch(/`models` for each panelist that ran on another model/);
  });

  it('chooses between aska:code and aska:code-lean by whether the branch will be squashed', () => {
    expect(text()).toMatch(/Prefer `aska:code` over `aska:code-lean` unless the user says the branch will be squashed/);
  });

  describe('step 2a, running the checks first', () => {
    const step = () => {
      const t = text();
      return t.slice(t.indexOf('### 2a. Run the checks first'), t.indexOf('## 3. Launch the panel'));
    };

    it('runs for a change subject whose head commit exists, before the panel launches', () => {
      expect(step().length).toBeGreaterThan(0);
      expect(step()).toContain('For a `change` subject whose head commit exists');
    });

    it('runs in a throwaway detached worktree of the head commit under /tmp, never the user\'s checkout', () => {
      const s = step();
      expect(s).toContain('git worktree add --detach <checks>/wt <head>');
      expect(s).toContain('mktemp -d /tmp/aska-checks-XXXXXX');
      expect(s).toMatch(/never in the user's checkout/i);
      expect(s).toMatch(/install dependencies there from the project's lockfile/i);
    });

    it('applies uncommitted changes to the worktree and says so in the record', () => {
      expect(step()).toContain('git -C <checks>/wt apply');
      expect(step()).toMatch(/untracked files aren't included/i);
    });

    it('keeps the worktree path in this run\'s own folder, never a shell variable or a shared file', () => {
      const s = step();
      expect(s).toContain('<dir>/checks-path.txt');
      expect(s).toMatch(/Shell variables don't carry from one command to the next/);
      expect(s).toMatch(/never keep it in a fixed, shared file/);
      expect(s).not.toContain('$tmp');
      expect(s).not.toMatch(/tmp=\$\(/);
    });

    it('cleans up only this run\'s own path, never a glob or another run\'s', () => {
      const s = step();
      expect(s).toMatch(/only the path in this run's `<dir>\/checks-path\.txt`/);
      expect(s).toMatch(/never a glob such as `\/tmp\/aska-checks-\*`/);
    });

    it('runs every documented gate when there is no single check command, recording each command and exit code', () => {
      const s = step();
      expect(s).toMatch(/When there's no single check command, run every gate the project defines/);
      for (const gate of ['`typecheck`', '`lint`', '`test`']) expect(s).toContain(gate);
      expect(s).toMatch(/README's development section/);
      expect(s).toMatch(/run every command, even after one fails/i);
      expect(s).toMatch(/repeat `Command:`, `Exit code:` and `Output \(last 40 lines\):` for each command/);
    });

    it('saves a bumped dependency\'s docs from the worktree before cleaning it up', () => {
      const s = step();
      const save = s.indexOf('**Save what the brief needs');
      const clean = s.indexOf('**Clean up**');
      expect(save).toBeGreaterThan(0);
      expect(clean).toBeGreaterThan(save);
      expect(s).toContain('<checks>/wt/node_modules/<name>/');
      expect(s).toContain('<dir>/deps/<name>/');
      expect(text()).toMatch(/list the copies step 2a saved in `<dir>\/deps\/`/);
    });

    it('runs the documented check command once, with a 10-minute limit', () => {
      const s = step();
      expect(s).toMatch(/documented check command/);
      expect(s).toMatch(/10 minutes/);
    });

    it('writes a short neutral record: command, exit code and a trimmed tail', () => {
      const s = step();
      expect(s).toContain('<dir>/checks.md');
      for (const field of ['Commit:', 'Setup:', 'Command:', 'Exit code:', 'Output (last 40 lines):']) expect(s).toContain(field);
      expect(text()).toMatch(/\*\*Checks:\*\*[^\n]*<dir>\/checks\.md/);
    });

    it('records a run that could not happen as exactly that, never as a defect', () => {
      const s = step();
      expect(s).toContain('checks didn\'t run: <reason>');
      for (const reason of ['no documented check command', 'setup failed', 'stopped after 10 minutes']) expect(s).toContain(reason);
      expect(text()).toMatch(/is not a defect in the change/);
    });

    it('cleans up the worktree and temp folder whatever happened, and asks before running untrusted code', () => {
      const s = step();
      expect(s).toContain('git worktree remove --force <checks>/wt');
      expect(s).toMatch(/even when a step failed/i);
      expect(s).toMatch(/ask the user before running/i);
      expect(s).not.toContain('aska:investigator');
    });
  });

  it('reports a verdict\'s tension next to it', () => {
    expect(text()).toMatch(/Verdicts:\*\*[^\n]*`tension`/);
  });

  it('keeps each run with runs new, and falls back to mktemp when it fails', () => {
    const t = text();
    expect(t).toContain('`runs new`: create the run folder and print its path.');
    expect(t).toContain('Create the run folder with `runs new`');
    expect(t).toContain("If it fails, say the run won't be kept after this session and use `mktemp -d -t aska-panel-XXXXXX` instead.");
    expect(t).not.toMatch(/temporary folder/);
  });

  it('records every compare on a kept run with --record', () => {
    const t = text();
    expect(t).toContain('compare --file <dir>/panel-result.json --json --record');
    expect(t).toContain('With a `mktemp` folder, omit `--record`.');
    expect(t).toMatch(/after every re-run or investigation in step 6/);
  });

  it('gives every aska:panelist call a fixed description naming the canonical persona', () => {
    const t = text();
    expect(t).toContain('Give each `aska:panelist` call the description `panelist <canonical>`, exactly.');
    expect(t).toContain('The re-ask call\'s description is `panelist <canonical> re-ask`.');
    expect(t).toContain('a name with a `:` is already canonical; otherwise use the row with that `name` and `shadowedBy: null`');
    expect(t).toContain('The re-run call\'s description is `panelist <canonical>`.');
  });

  it('runs a panelist on the model its saved panel or the user gives it', () => {
    const t = text();
    expect(t).toContain('`list panels --json` rows have fields `canonical, name, scope, plugin, path, description, personas, models, shadowedBy, valid, errorCount`');
    expect(t).toContain("pass that model as the call's `model` parameter");
    expect(t).toMatch(/re-ask[^.]*same model/i);
  });

  it('mentions no agent host', () => {
    expect(text()).not.toMatch(/paseo/i);
  });

  it('documents the fields of list units --json', () => {
    expect(text()).toContain('`list units --json` rows have fields `canonical, name, scope, plugin, path, description, shadowedBy, valid, errorCount, threshold, appliesWhen`.');
  });

  it('pins the selection order, the size rule and the neutral summary', () => {
    const t = text();
    for (const s of ['`default`', 'identical for every panelist']) expect(t).toContain(s);
    expect(t).toMatch(/\bpanel\b[^.;]*\b(?:at least 2|never[^.;]*fewer than 2)\b[^.;]*panelists/i);
    expect(t).toMatch(/for a \*\*conversation\*\* subject, write a neutral summary:[\s\S]*?no recommendation\*\* and no hint of which way you lean/i);
  });

  it('launches a saved panel\'s personas exactly as listed, and canonical only for suggested ad-hoc panels', () => {
    const t = text();
    expect(t).toContain("Launch a saved panel's `personas` exactly as listed");
    expect(t).toContain('for a suggested ad-hoc panel (no saved panel), use the `canonical` name from `list personas --json`');
  });

  it('mentions aska:ship when a single default name matches no saved panel', () => {
    expect(text()).toContain('If the single name is `default` or `aska:default` and no such panel exists, say that `aska:default` is now `aska:ship`.');
  });

  it('pins the four selection cases in index order', () => {
    const t = text();
    const order = [
      'Two or more persona names',
      'One name that is a saved panel',
      'No names, and a user or project `default` panel exists',
      'No names otherwise, or the user asks in words for a suggestion',
    ].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('ships no default panel, lets a request in words override one, and reserves no keyword', () => {
    const t = text();
    expect(t).toContain('The plugin ships no `default` panel.');
    expect(t).toContain("A request in words overrides even the user's own `default`.");
    expect(t).toContain('There is no `suggest` keyword');
  });

  it('mentions aska:default only in the single-name rename explanation (case 2)', () => {
    const t = text();
    expect(t.match(/aska:default/g)).toHaveLength(2);
    expect(t.indexOf('aska:default')).toBeLessThan(t.indexOf('No names, and a user or project'));
  });

  it('proposes a lineup instead of running an invalid default panel', () => {
    expect(text()).toContain("If that `default` panel is invalid, say so (with its path) and propose a lineup instead.");
  });

  it('says units is null when a persona does not resolve or is shadowed', () => {
    expect(text()).toContain("or `null` when the persona doesn't resolve or is shadowed.");
  });

  it('casts proposals only from valid, unshadowed, resolving rows', () => {
    const t = text();
    expect(t).toContain('Candidates are `list personas --json` rows with `valid: true`, `shadowedBy: null` and non-null `units`.');
    expect(t).toContain('Saved panels you may propose are `list panels --json` rows with `valid: true` and `shadowedBy: null`.');
  });

  it('pins the five proposal rules in order', () => {
    const t = text();
    const order = ['**Name the concerns.**', '**Cover them.**', '**Make disagreement possible.**', '**Check the saved panels.**', '**Flag gaps.**'].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const s of [
      'only from units some candidate holds',
      'Every concern must be primary for at least one panelist.',
      'between 2 and 6 personas',
      'Never seat two personas whose primary units are identical.',
      'prefer project, then user, then plugin scope',
      'offer `/aska:author`',
      "Never stretch a persona to cover a concern it doesn't hold.",
      'it runs as that saved panel, with its notes',
      "that run is ad-hoc (`panel: null`) and keeps the panel's notes in the brief",
    ]) expect(t).toContain(s);
  });

  it('pins the proposal layout, its neutrality, and that nothing runs before the reply', () => {
    const t = text();
    const order = ['Question: "', 'Concerns: ', 'Proposed panel:', 'Run this panel? Reply yes, edit it ("add …", "drop …"), or name a saved panel.'].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).toContain('`Proposed panel: <name> (saved, <scope>)`');
    expect(t).toContain('Every reason names units from the catalog.');
    expect(t).toContain('Never preview what any panelist will conclude.');
    expect(t).toContain('Nothing launches until the user replies.');
  });

  it('re-checks an edited lineup, and keeps notes when a saved panel is edited', () => {
    const t = text();
    expect(t).toContain('Re-check an edited lineup: 2–6 panelists, each resolving.');
    expect(t).toContain("An edited saved panel runs ad-hoc (`panel: null`) and keeps that panel's notes in the brief.");
  });

  it('applies the fewer-than-2 stop to proposals too', () => {
    expect(text()).toContain('This applies to proposals too: never propose fewer than 2 candidates.');
  });

  it('does not ask again at launch after a confirmed proposal', () => {
    expect(text()).toContain('A proposal the user accepted in step 1a already counts as confirmation.');
  });

  it('reports missing personas and offers to build them with /aska:author, with no fallback', () => {
    const t = text();
    expect(t).toMatch(/fewer than 2 personas exist[^.]*say[^.]*no personas/i);
    expect(t).toContain('offer to build them with `/aska:author`');
    expect(t).not.toMatch(/general-purpose[^.]*panelist/i);
  });

  it('requires every aska:panelist call in one message, and keeps investigations off it', () => {
    const t = text();
    expect(t).toContain('aska:panelist');
    expect(t).toMatch(/must\*{0,2} be in one message, one call per panelist/i);
    expect(t).toMatch(/never launch one panelist and wait for its reply before launching the next/i);
    expect(t).toMatch(/never use `aska:panelist` for an investigation/i);
  });

  it('requires a re-ask once on an invalid judgment, covering malformed, timeout and error', () => {
    const t = text();
    expect(t).toContain('re-ask once');
    expect(t).toContain('`malformed`');
    expect(t).toContain('`timeout`');
    expect(t).toContain('`error`');
  });

  it('pins mktemp and the compare --file --json invocation', () => {
    const t = text();
    expect(t).toContain('mktemp -d');
    expect(t).toContain('compare --file <path> --json');
  });

  it('pins the Re-run follow-up replacing the entry and re-running compare with --record', () => {
    const t = text();
    expect(t).toMatch(/\*\*Re-run:\*\*[^\n]*Replace its entry/);
    expect(t).toContain('run `compare` again (with `--record` on a kept run, as in step 4)');
  });

  it('runs investigations on aska:investigator with no persona, one per distinct check', () => {
    const t = text();
    expect(t).toMatch(/\*\*Investigate:\*\*[^\n]*`aska:investigator`/);
    expect(t).toMatch(/never give it a persona prompt or any panelist's judgment/i);
    expect(t).toMatch(/one `aska:investigator` call per distinct check/i);
    expect(t).toContain('each with the description `investigator <n>`');
    expect(t).not.toContain('W_STALE_RENDER');
    expect(t).not.toMatch(/general-purpose subagent/i);
  });

  it('gives the investigator only the brief and the items, with no instructions of its own', () => {
    expect(text()).toMatch(/add nothing else to the task: no instructions of your own/i);
  });

  it('checks each reply with check-evidence, re-asks once, and never feeds an unusable reply to the panel', () => {
    const t = text();
    expect(t).toMatch(/\*\*Investigate:\*\*[\s\S]*?run `check-evidence --file <that file>`/);
    expect(t).toContain('`investigator <n> re-ask`');
    expect(t).toMatch(/still invalid, or the call timed out or failed/i);
    expect(t).toMatch(/don't add it to the brief/i);
    expect(t).toMatch(/if no evidence was added, don't re-run the panel/i);
    expect(t).toMatch(/the follow-up stays open/i);
    expect(t).toContain('`<dir>/evidence/<n>.rejected.md`');
    expect(t).toContain('numbering on from any evidence file already there, rejected ones included');
  });

  it('adds evidence to the brief, then re-runs the whole panel and re-compares', () => {
    const t = text();
    expect(t).toContain('<dir>/evidence/');
    expect(t).toMatch(/\*\*Evidence:\*\*/);
    expect(t).toContain("Weigh it as fact; don't ask to investigate it again unless its *Not determined* section leaves your question open.");
    expect(t).toContain('Keep a reply whose *Not determined* section is all it has; that is evidence too.');
    expect(t).toMatch(/re-run every panelist/i);
    expect(t).toMatch(/\*\*Investigate:\*\*[\s\S]*?marking the units whose status changed/);
    expect(t).toMatch(/\*\*Investigate:\*\*[\s\S]*?run `compare` again \(with `--record` on a kept run, as in step 4\)/);
  });

  it('requires announcing the panel size and materials without asking for confirmation', () => {
    const t = text();
    expect(t).toMatch(/say how many panelists will run/i);
    expect(t).toMatch(/don't ask for confirmation/i);
  });

  it('never permits a recommendation outside the chair section, however it is phrased', () => {
    const t = text();
    expect(t).not.toMatch(/you may also add your own recommendation/i);
  });

  it('says panel is the saved panel name or null for an ad-hoc panel', () => {
    const t = text();
    expect(t).toMatch(/`panel` is the saved panel's name, or `null` for an ad-hoc panel/);
  });

  it('says to strip exactly one surrounding code fence before saving a reply', () => {
    const t = text();
    expect(t).toContain('strip one surrounding code fence and nothing else');
  });

  it('keeps the footer folder for follow-ups', () => {
    const t = text();
    expect(t).toMatch(/don't delete the folder; follow-ups use it/i);
  });

  it('bars an unrequested recommendation and requires Follow-ups to mirror compare exactly', () => {
    const t = text();
    expect(t).toMatch(/every line of the report comes from `compare`'s output/i);
    expect(t).toContain("lists exactly `compare`'s `followUps`");
    expect(t).toContain('in order, one numbered line each');
    expect(t).toContain("don't merge, reword into new actions, or add your own");
    expect(t).toMatch(/without a request for a recommendation, add no recommendation/i);
  });

  it('describes the report order, materials-as-files, and the chair rule', () => {
    const t = text();
    const order = ['Header', 'Verdicts', 'Where they disagree', 'Where they agree', 'Outside their scope', 'Conditions', 'Follow-ups', 'Chair', 'Footer'].map((h) => t.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).toMatch(/chair.*only when the user asks/i);
    expect(t).toMatch(/never add a finding no panelist raised/i);
    expect(t).toMatch(/materials.*as file paths/i);
    expect(t).toContain('write the diff or PR content to files');
  });

  it('is environment-agnostic', () => {
    expect(text()).not.toMatch(/herdr|orca|paseo/i);
    expect(readFileSync(join(repo, 'agents/panelist.md'), 'utf8')).not.toMatch(/herdr|orca|paseo/i);
  });

  it('offers to save only after an ad-hoc run, between the chair and the footer', () => {
    const t = text();
    expect(t).toContain('Save this lineup as a panel? Reply "save <name>".');
    expect(t).toMatch(/\*\*Save offer:\*\* only for an ad-hoc run/);
    const [chair, offer, footer] = ['**Chair:**', '**Save offer:**', '**Footer:**'].map((s) => t.indexOf(s));
    expect(chair).toBeGreaterThanOrEqual(0);
    expect(chair).toBeLessThan(offer!);
    expect(offer).toBeLessThan(footer!);
  });

  it('warns before saving a project-scope panelist into a user-scope panel', () => {
    expect(text()).toContain("If any panelist is a project-scope persona and the user picks user scope, say the panel won't resolve in other projects and ask before going on.");
  });

  it('pins the save steps: scope, name checks, file contents, validation', () => {
    const t = text();
    const order = ['**Ask where:**', '**Check the name.**', '**Write `<name>.panel.md`:**', '**Validate:**'].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const s of [
      'project scope (`.claude/personas/`, the default) or user scope (`~/.claude/personas/`)',
      'never overwrite',
      'say which one and ask before going on',
      '"this will now run whenever you give no names."',
      "`personas` with each panelist's `canonical` from `list personas --json`",
      'delete the file and say why',
      'Never write a panel file without a `save` reply.',
      "Never save into the plugin's own folder.",
    ]) expect(t).toContain(s);
  });
});

describe('gate skill', () => {
  const path = join(repo, 'skills/gate/SKILL.md');
  const text = () => readFileSync(path, 'utf8');

  it('has frontmatter naming it gate, triggering on gating a step', () => {
    const fm = splitFrontmatter(path, text()).fm!;
    expect(fm.data.name).toBe('gate');
    expect(String(fm.data.description)).toMatch(/gate/i);
    expect(String(fm.data.description)).toMatch(/adversarial/i);
  });

  it('guards for the operator bundle and uses exactly the gate CLI commands', () => {
    const t = text();
    expect(t).toContain('check that `<base directory>/../operator/scripts/persona.mjs` exists');
    expect(t).toContain('This skill must be used from the aska plugin (its operator skill and CLI are missing)');
    expect(t).toContain('targets --from <step-file> --out <tmp>/targets.json');
    expect(t).toContain('prompt gate --panel --checks <tmp>/targets.json');
    expect(t).toContain('check-judgment gate --file <tmp>/judgment.json --checks <tmp>/targets.json');
    expect(t).toContain('gate --file <tmp>/judgment.json --checks <tmp>/targets.json --json');
    expect(t).toContain('mktemp -d -t aska-gate-XXXXXX');
  });

  it('launches one fresh aska:gate-reviewer on opus with nothing from this conversation', () => {
    const t = text();
    expect(t).toMatch(/exactly one `aska:gate-reviewer` subagent with model `opus`/i);
    expect(t).toMatch(/a new `aska:gate-reviewer` subagent with model `opus`/i);
    expect(t).toMatch(/never use a general-purpose agent in its place/i);
    expect(t).toMatch(/never reuse an agent/i);
    expect(t).toMatch(/nothing from this conversation/i);
  });

  it('re-asks once with a fresh agent, and strips exactly one code fence', () => {
    const t = text();
    expect(t).toMatch(/re-ask once/i);
    expect(t).toMatch(/strip one surrounding code fence and nothing else/i);
  });

  it('takes the result only from gate --json and adds no opinion', () => {
    const t = text();
    expect(t).toMatch(/never state a result .* without running `gate`/i);
    expect(t).toMatch(/no opinion of your own/i);
  });

  it('saves a numbered record only with a yes, never overwrites, never edits traceability', () => {
    const t = text();
    expect(t).toContain('<records>/judgment-<n>.json');
    expect(t).toContain('.claude/aska/gates/<step-stem>/');
    expect(t).toContain('targets-<n>.json');
    expect(t).toMatch(/only (after|when) the user says yes/i);
    expect(t).toMatch(/never overwrite/i);
    expect(t).toMatch(/never edit a traceability file/i);
  });

  it('numbers records one more than the highest across judgment and targets files', () => {
    const t = text();
    expect(t).toMatch(/highest number found across existing `judgment-<n>\.json` and `targets-<n>\.json` files there/i);
  });

  it('works out the default range from origin/HEAD, falling back to main, never a stale local branch', () => {
    const t = text();
    expect(t).toContain('git rev-parse --verify -q origin/HEAD');
    expect(t).toContain('git merge-base origin/HEAD HEAD');
    expect(t).toContain('git merge-base main HEAD');
    expect(t).toMatch(/merge-base.*fails.*ask the user for an explicit/i);
  });

  it('stores targets per run so every earlier record stays re-checkable', () => {
    const t = text();
    expect(t).not.toMatch(/`targets\.json`:\s*if absent/);
    expect(t).not.toMatch(/stop and say the step's targets changed/i);
    expect(t).toContain('targets-<n>.json');
    expect(t).toMatch(/checks <records>\/targets-<n>\.json/);
  });

  it('runs the implementation-check commands in a throwaway worktree, never the user checkout', () => {
    const t = text();
    expect(t).toMatch(/git worktree add --detach/i);
    expect(t).toMatch(/git worktree remove --force/i);
    expect(t).toMatch(/never the user's checkout/i);
  });

  it('prepares the throwaway worktree before running commands, and treats setup failures as deferred, never broken', () => {
    const t = text();
    expect(t).toMatch(/install dependencies there from the project's lockfile/i);
    expect(t).toMatch(/installing only inside that worktree/i);
    expect(t).toMatch(/a failure caused by that setup.*not by the change.*is an environment problem/i);
    expect(t).toMatch(/mark the affected targets `deferred` with `needs` naming the missing setup, never `broken`/i);
  });

  it('pins the throwaway worktree to the range\'s head, not always HEAD', () => {
    const t = text();
    expect(t).toContain('git worktree add --detach <tmp>/wt <head>');
    expect(t).not.toMatch(/git worktree add --detach <tmp>\/wt HEAD/);
  });

  it('saves records where the user says, by default under the project\'s .claude/, never a hard-coded docs layout', () => {
    const t = text();
    expect(t).toContain('/aska:gate <step-file> [<base>..<head>] [--records <dir>]');
    expect(t).toMatch(/`<records>` is `<dir>` when given, otherwise `\.claude\/aska\/gates\/<step-stem>\/`/);
    expect(t).not.toContain('docs/superpowers');
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    expect(readme).toContain('.claude/aska/gates/<step>/');
    expect(readme).toContain('--records <dir>');
    expect(readme).not.toContain('docs/superpowers/reviews');
  });

  it('tells the gate not to read earlier gate records or implementer reports', () => {
    const t = text();
    expect(t).toMatch(/out of bounds/i);
    expect(t).toMatch(/out of bounds:\*\* earlier gate records in `<records>`/i);
    expect(t).toMatch(/implementer report/i);
    expect(t).toMatch(/not from past verdicts/i);
  });

  it('falls back to a README.md in the step file\'s folder for spec discovery', () => {
    const t = text();
    expect(t).toMatch(/if it names none, a `\*\*Spec:\*\*` line in a `README\.md` in the step file's folder/i);
  });

  it('gives exit-code guidance for gate and targets', () => {
    const t = text();
    expect(t).toMatch(/exits 1 .*error.*2 .*usage error/i);
    expect(t).toMatch(/exits 0 for `pass` or `pass-with-conditions` and 1 for `fail`/i);
    expect(t).toMatch(/exits 2 when there is no result: a usage error, or a judgment or targets file it can't read/i);
  });

  it('is environment-agnostic', () => {
    expect(text()).not.toMatch(/herdr|orca|paseo/i);
  });

  it('reports the missing list from the judgment when the verdict is insufficient-information', () => {
    const t = text();
    expect(t).toContain('insufficient-information');
    expect(t).toContain('missing');
  });
});
