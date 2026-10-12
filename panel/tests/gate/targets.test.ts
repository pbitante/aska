import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractTargets, parseTargetsFile, type Target } from '../../src/gate/targets';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/gate/${name}`, import.meta.url)), 'utf8');
const targetsOf = (md: string): Target[] => {
  const r = extractTargets(md);
  if ('error' in r) throw new Error(r.error);
  return r.targets;
};

describe('extractTargets', () => {
  it('numbers the targets of a realistic step file, splitting nested bullets', () => {
    const t = targetsOf(fixture('nested-step.md'));
    expect(t.map((x) => x.id)).toEqual(['T1', 'T2.1', 'T2.2', 'T2.3', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']);
    expect(t[0]!.text).toBe('Signature checks: a request signed with an old key; a replayed delivery; a delivery for another account or endpoint; a delivery after the subscription was cancelled.');
    expect(t[1]!.text).toBe('Payload handling on the receiving side — the sender including fields the schema never defined (the sender is trusted, but its payload must still go through every server check);');
    expect(t[3]!.text).toBe('Payload handling on the receiving side — event types outside the schema.');
    expect(t[9]!.text).toBe('Compatibility: the Step 3 sender against the Step 4 receiver, and the Step 4 sender against a receiver with batching turned off.');
  });

  it('reads the aska step file shape and stops at the next ## heading', () => {
    const t = targetsOf(fixture('panel-step1.md'));
    expect(t.map((x) => x.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(t[3]!.text).toBe('Exit-code consistency with the existing commands.');
  });

  it('matches the heading case-insensitively with surrounding whitespace', () => {
    expect(targetsOf('#  x\n\n  ## adversarial REVIEW targets  \n\n- one\n')).toEqual([{ id: 'T1', text: 'one' }]);
  });

  it('ignores prose and ### headings inside the section without renumbering', () => {
    const md = '## Adversarial review targets\n\nIntro prose.\n\n- one\n\n### Sub\n\nMore prose.\n\n* two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('stops at a # or ## heading, and only reads the first section', () => {
    const md = '## Adversarial review targets\n- one\n# Next\n- not a target\n## Adversarial review targets\n- also not\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }]);
  });

  it('joins deeper nesting onto its nested parent', () => {
    const md = '## Adversarial review targets\n- Parent:\n  - child\n    - grandchild\n  - second\n';
    expect(targetsOf(md)).toEqual([
      { id: 'T1.1', text: 'Parent — child grandchild' },
      { id: 'T1.2', text: 'Parent — second' },
    ]);
  });

  it('treats CRLF exactly like LF', () => {
    const lf = fixture('nested-step.md');
    expect(targetsOf(lf.replace(/\n/g, '\r\n'))).toEqual(targetsOf(lf));
  });

  it('is deterministic', () => {
    const md = fixture('nested-step.md');
    expect(JSON.stringify(targetsOf(md))).toBe(JSON.stringify(targetsOf(md)));
  });

  it('reports a missing or empty section', () => {
    expect(extractTargets('# Title\n\n- a bullet elsewhere\n')).toEqual({ error: 'no-section' });
    expect(extractTargets('## Adversarial review targets\n\nNothing yet.\n\n## Next\n- x\n')).toEqual({ error: 'no-bullets' });
  });

  it('does not drop nested bullets when prose sits between a parent and its children', () => {
    const md = '## Adversarial review targets\n- P:\n\nSome prose.\n\n  - a\n  - b\n- Q\n';
    expect(targetsOf(md)).toEqual([
      { id: 'T1.1', text: 'P — a' },
      { id: 'T1.2', text: 'P — b' },
      { id: 'T2', text: 'Q' },
    ]);
  });

  it('does not end the section on a # line inside a fenced code block', () => {
    const md = '## Adversarial review targets\n- one\n```bash\n# run this\nnpm test\n```\n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('skips a fenced example of the heading that appears before the real section', () => {
    const md = '```md\n## Adversarial review targets\n- fake\n```\n\n## Adversarial review targets\n- real\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'real' }]);
  });

  it('treats a tab-indented bullet as a nested child, not a new top-level target', () => {
    const md = '## Adversarial review targets\n- P:\n\t- a\n\t- b\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1.1', text: 'P — a' }, { id: 'T1.2', text: 'P — b' }]);
  });

  it('skips a bare "- " bullet instead of emitting an empty target', () => {
    const md = '## Adversarial review targets\n- \n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'two' }]);
  });

  it('skips thematic breaks (***, - - -, * * *) instead of reading them as bullets', () => {
    const md = '## Adversarial review targets\n- one\n***\n- - -\n* * *\n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('joins an unindented lazy-continuation line onto the item above it', () => {
    expect(targetsOf('## Adversarial review targets\n- one wraps\nonto here\n')).toEqual([{ id: 'T1', text: 'one wraps onto here' }]);
  });

  it('treats an unindented line after a blank line as ignored prose, not a continuation', () => {
    const md = '## Adversarial review targets\n- one\n\nunrelated prose\n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('ends the section on a heading indented 1-3 spaces', () => {
    const md = '## Adversarial review targets\n- one\n ## Next\n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }]);
  });

  it('does not take a heading indented 4+ spaces (an indented code block) as the section', () => {
    expect(extractTargets('    ## Adversarial review targets\n    - a\n')).toEqual({ error: 'no-section' });
    expect(targetsOf('    ## Adversarial review targets\n    - a\n\n## Adversarial review targets\n- real\n')).toEqual([{ id: 'T1', text: 'real' }]);
  });

  it('does not glue a ### heading with no blank line before it onto the previous target', () => {
    const md = '## Adversarial review targets\n- one\n### Sub\nprose under it\n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('does not glue a numbered list starting at 1 with no blank line before it onto the previous target', () => {
    const md = '## Adversarial review targets\n- one\n1. a numbered step\n2) another\n- two\n- three\n 1) also a list\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }, { id: 'T3', text: 'three' }]);
  });

  it('keeps a wrapped line that starts with a number other than 1 as part of the target', () => {
    const md = '## Adversarial review targets\n- Retries must stop after\n3. attempts, and the backoff must double each time.\n- Second target';
    expect(targetsOf(md)).toEqual([
      { id: 'T1', text: 'Retries must stop after 3. attempts, and the backoff must double each time.' },
      { id: 'T2', text: 'Second target' },
    ]);
  });

  it('continues the bullet with a numbered line indented 2 or more spaces', () => {
    const md = '## Adversarial review targets\n- one\n  1. nested step\n  2. another\n- two\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one 1. nested step 2. another' }, { id: 'T2', text: 'two' }]);
  });

  it('accepts a closed ATX form of the section heading', () => {
    expect(targetsOf('## Adversarial review targets ##\n- one\n')).toEqual([{ id: 'T1', text: 'one' }]);
  });

  it('treats + as a bullet marker', () => {
    expect(targetsOf('## Adversarial review targets\n+ one\n+ two\n')).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('ignores every line of a wrapped prose paragraph after a blank line', () => {
    const md = '## Adversarial review targets\n- one\n- two\n\nThis prose paragraph\nwraps onto a second line.\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'one' }, { id: 'T2', text: 'two' }]);
  });

  it('keeps its own number for an empty top-level bullet that gains nested children', () => {
    const md = '## Adversarial review targets\n- a\n- \n  - x\n  - y\n';
    expect(targetsOf(md)).toEqual([
      { id: 'T1', text: 'a' },
      { id: 'T2.1', text: 'x' },
      { id: 'T2.2', text: 'y' },
    ]);
  });

  it('still skips an empty top-level bullet with no children, taking no number', () => {
    const md = '## Adversarial review targets\n- a\n- \n- b\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'a' }, { id: 'T2', text: 'b' }]);
  });

  it('keeps its own number for a bare "-" (no trailing space) top-level bullet that gains nested children', () => {
    const md = '## Adversarial review targets\n- a\n-\n  - x\n  - y\n';
    expect(targetsOf(md)).toEqual([
      { id: 'T1', text: 'a' },
      { id: 'T2.1', text: 'x' },
      { id: 'T2.2', text: 'y' },
    ]);
  });

  it('does not treat "-foo" (no space after the marker) as a bullet', () => {
    expect(extractTargets('## Adversarial review targets\n-foo\n')).toEqual({ error: 'no-bullets' });
  });

  it('trims target text when an empty bullet is followed by an indented continuation line', () => {
    const md = '## Adversarial review targets\n- \n  foo\n';
    expect(targetsOf(md)).toEqual([{ id: 'T1', text: 'foo' }]);
  });

  it('round-trips through parseTargetsFile without producing an empty-text target', () => {
    const r = extractTargets('## Adversarial review targets\n- \n- real\n');
    if ('error' in r) throw new Error(r.error);
    const parsed = parseTargetsFile(JSON.stringify({ source: 's.md', targets: r.targets }));
    expect(parsed).toEqual({ targets: [{ id: 'T1', text: 'real' }] });
  });
});

describe('parseTargetsFile', () => {
  it('accepts a valid file', () => {
    expect(parseTargetsFile('{"source":"s.md","targets":[{"id":"T1","text":"a"}]}')).toEqual({ targets: [{ id: 'T1', text: 'a' }] });
  });

  it('names each problem', () => {
    const e = (s: string) => (parseTargetsFile(s) as { error: string }).error;
    expect(e('nope')).toBe('the targets file is not valid JSON');
    expect(e('[]')).toBe('the targets file must be a JSON object');
    expect(e('{"targets":[]}')).toBe('the targets file needs a non-empty "targets" list');
    expect(e('{"targets":[{"id":"T1"}]}')).toBe('targets[0] needs a non-empty "id" and "text"');
    expect(e('{"targets":[{"id":" ","text":"a"}]}')).toBe('targets[0] needs a non-empty "id" and "text"');
    expect(e('{"targets":[{"id":"T1","text":"a"},{"id":"T1","text":"b"}]}')).toBe('targets[1]: duplicate id "T1"');
  });

  it('trims id and text before checking and storing', () => {
    expect(parseTargetsFile('{"targets":[{"id":" T1 ","text":" a "}]}')).toEqual({ targets: [{ id: 'T1', text: 'a' }] });
    const e = (s: string) => (parseTargetsFile(s) as { error: string }).error;
    expect(e('{"targets":[{"id":"T1","text":"a"},{"id":" T1","text":"b"}]}')).toBe('targets[1]: duplicate id "T1"');
  });
});
