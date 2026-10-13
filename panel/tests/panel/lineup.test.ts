import { describe, expect, it } from 'vitest';
import { resolveLineup } from '../../src/panel/lineup';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

const persona = (name: string, extra: string[] = []) => personaMd([`name: ${name}`, `description: ${name}.`, ...extra, 'units:', '  primary: [aska:a]']);
const files = (extra: Record<string, string> = {}) => ({
  'aska/units/a.md': unitMd('a'),
  'aska/personas/guardian.md': persona('guardian'),
  'aska/personas/tester.md': persona('tester'),
  'aska/personas/historian.md': persona('historian', ['model: haiku']),
  'aska/panels/code.md': panelMd('code', ['aska:guardian', 'aska:tester', 'aska:historian'], { extra: ['models:', '  aska:guardian: opus'] }),
  ...extra,
});
const lineup = (names: string[], model?: string, extra?: Record<string, string>) => resolveLineup(registryFor(files(extra)).reg, { names, model });
const pick = (l: ReturnType<typeof lineup>) => l.panelists.map((p) => [p.persona, p.model, p.modelSource]);
const codes = (l: ReturnType<typeof lineup>) => l.diagnostics.map((d) => d.code);

describe('resolveLineup: a saved panel', () => {
  it('launches the panel as listed, with its models, persona defaults and the session model', () => {
    const l = lineup(['code']);
    expect(l.diagnostics).toEqual([]);
    expect(l.panel).toBe('aska:code');
    expect(l.panelists.map((p) => p.canonical)).toEqual(['aska:guardian', 'aska:tester', 'aska:historian']);
    expect(pick(l)).toEqual([
      ['aska:guardian', 'opus', 'panel'],
      ['aska:tester', null, 'session'],
      ['aska:historian', 'haiku', 'persona'],
    ]);
  });

  it('puts every member on --model, over the panel and the persona', () => {
    expect(pick(lineup(['code'], 'sonnet'))).toEqual([
      ['aska:guardian', 'sonnet', 'run'],
      ['aska:tester', 'sonnet', 'run'],
      ['aska:historian', 'sonnet', 'run'],
    ]);
  });

  it('puts a tagged member on its own model, over --model, and stays the saved panel', () => {
    const l = lineup(['code', 'tester@haiku'], 'sonnet');
    expect(l.panel).toBe('aska:code');
    expect(pick(l)).toEqual([
      ['aska:guardian', 'sonnet', 'run'],
      ['aska:tester', 'haiku', 'panelist'],
      ['aska:historian', 'sonnet', 'run'],
    ]);
  });

  it("prefers the panel's model over the persona default", () => {
    const l = lineup(['code'], undefined, {
      'aska/panels/code.md': panelMd('code', ['aska:guardian', 'aska:historian'], { extra: ['models:', '  aska:historian: sonnet'] }),
    });
    expect(pick(l)).toEqual([['aska:guardian', null, 'session'], ['aska:historian', 'sonnet', 'panel']]);
  });

  it("puts a tagged member on its own model, over the panel's model", () => {
    expect(pick(lineup(['code', 'guardian@haiku']))[0]).toEqual(['aska:guardian', 'haiku', 'panelist']);
  });

  it("doesn't inherit Object.prototype for a member listed as the bare ref \"constructor\" with no models entry", () => {
    const l = lineup(['code'], undefined, {
      'project/personas/constructor.md': persona('constructor'),
      'aska/panels/code.md': panelMd('code', ['aska:guardian', 'constructor']),
    });
    expect(pick(l)).toEqual([['aska:guardian', null, 'session'], ['constructor', null, 'session']]);
  });

  it('resolves the names a re-run rebuilds: the tag replaced, not appended', () => {
    // The run was `code tester@haiku`; "re-run the tester on opus" replaces its tag.
    expect(pick(lineup(['code', 'tester@opus']))[1]).toEqual(['aska:tester', 'opus', 'panelist']);
  });

  it('matches a tagged member by bare name, by canonical name, and accepts fable', () => {
    expect(pick(lineup(['code', 'tester@fable', 'aska:historian@opus'])).slice(1)).toEqual([
      ['aska:tester', 'fable', 'panelist'],
      ['aska:historian', 'opus', 'panelist'],
    ]);
  });

  it('refuses a bare name that a project persona shadows, instead of tagging the wrong one', () => {
    const l = lineup(['code', 'tester@haiku'], undefined, { 'project/personas/tester.md': personaMd(['name: tester', 'description: P.', 'units:', '  primary: [aska:a]']) });
    expect(codes(l)).toEqual(['E_LINEUP']);
    expect(l.diagnostics[0]!.message).toBe('tester is not on panel aska:code');
    expect(l.panelists).toEqual([]);
    expect(l.panel).toBeNull();
  });

  it('refuses a member tagged twice, and a non-member', () => {
    expect(lineup(['code', 'tester@haiku', 'aska:tester@opus']).diagnostics.map((d) => d.message)).toEqual(['aska:tester is tagged twice']);
    expect(lineup(['code', 'ghost@haiku']).diagnostics.map((d) => d.message)).toEqual(['ghost is not on panel aska:code']);
  });

  it('reads an untagged second name as a persona lineup', () => {
    expect(codes(lineup(['code', 'tester']))).toEqual(['E_PANEL_PERSONA']);
  });

  it('refuses a whole panel tagged with @, pointing at --model', () => {
    const l = lineup(['code@sonnet']);
    expect(codes(l)).toEqual(['E_LINEUP']);
    expect(l.diagnostics[0]!.fix).toBe('Put a whole panel on one model with --model <m>');
  });

  it("returns an invalid panel's own diagnostics and no lineup", () => {
    const l = lineup(['code'], undefined, { 'aska/panels/code.md': panelMd('code', ['aska:guardian', 'aska:nobody']) });
    expect(codes(l)).toContain('E_PANEL_PERSONA');
    expect(l.panelists).toEqual([]);
  });
});

describe('resolveLineup: a persona lineup', () => {
  it('launches canonical names, with persona defaults and the session model, and no panel layer', () => {
    const l = lineup(['tester', 'historian', 'guardian']);
    expect(l.panel).toBeNull();
    expect(pick(l)).toEqual([
      ['aska:tester', null, 'session'],
      ['aska:historian', 'haiku', 'persona'],
      ['aska:guardian', null, 'session'],
    ]);
  });

  it('resolves the names a re-run rebuilds: the name replaced by its tagged form', () => {
    // The run was `tester historian`; "re-run the tester on opus" gives `tester@opus historian`.
    expect(pick(lineup(['tester@opus', 'historian']))[0]).toEqual(['aska:tester', 'opus', 'panelist']);
  });

  it('accepts fable for --model', () => {
    expect(pick(lineup(['tester', 'historian'], 'fable'))).toEqual([['aska:tester', 'fable', 'run'], ['aska:historian', 'fable', 'run']]);
  });

  it('applies @ over --model over the persona default', () => {
    expect(pick(lineup(['tester@opus', 'historian'], 'sonnet'))).toEqual([
      ['aska:tester', 'opus', 'panelist'],
      ['aska:historian', 'sonnet', 'run'],
    ]);
  });

  it('needs 2 to 6 personas, each resolving once', () => {
    expect(codes(lineup(['tester']))).toEqual(['E_PANEL_SIZE']);
    expect(codes(lineup(['tester', 'aska:tester']))).toEqual(['E_PANEL_PERSONA']);
    expect(codes(lineup(['tester', 'nobody']))).toEqual(['E_PANEL_PERSONA']);
  });

  it("refuses a persona that doesn't resolve", () => {
    const l = lineup(['tester', 'guardian'], undefined, { 'aska/personas/guardian.md': personaMd(['name: guardian', 'description: G.', 'units:', '  primary: [aska:missing]']) });
    expect(codes(l)).toEqual(['E_LINEUP']);
    expect(l.diagnostics[0]!.fix).toBe('Run: persona validate aska:guardian');
  });
});

describe('resolveLineup: models and names', () => {
  it('rejects unknown models, case-sensitively, with a did-you-mean', () => {
    const run = lineup(['tester', 'guardian'], 'Sonnet');
    expect(run.diagnostics.map((d) => [d.code, d.message, d.fix])).toEqual([['E_LINEUP', 'unknown model "Sonnet" in --model', 'Did you mean "sonnet"?']]);
    const tag = lineup(['tester@sonet', 'guardian']);
    expect(tag.diagnostics.map((d) => [d.message, d.fix])).toEqual([['unknown model "sonet" for tester', 'Did you mean "sonnet"?']]);
    expect(lineup(['tester@gpt-5', 'guardian']).diagnostics[0]!.fix).toBe('Use one of haiku, sonnet, opus, fable');
  });

  it('rejects malformed names', () => {
    for (const bad of ['tester@sonnet@opus', 'tester@', '@sonnet', 'Tester']) {
      expect(codes(lineup([bad, 'guardian'])), bad).toContain('E_LINEUP');
    }
  });

  it('rejects an empty lineup', () => {
    expect(codes(lineup([]))).toEqual(['E_LINEUP']);
  });
});

describe('resolveLineup: a saved panel next to an untagged name', () => {
  it('tells the user to tag every other name, or list personas only', () => {
    const l = lineup(['code', 'tester@sonnet', 'historian']);
    expect(l.panelists).toEqual([]);
    expect(codes(l)).toEqual(['E_PANEL_PERSONA']);
    expect(l.diagnostics[0]!.fix).toBe('code is a saved panel: tag every other name with @<m>, or list personas only');
  });
});

describe('resolveLineup: a name that is both a saved panel and a persona', () => {
  const both = { 'aska/personas/code.md': persona('code') };

  it('reads the panel and warns, so the skill can ask which was meant', () => {
    const l = lineup(['code', 'tester@sonnet'], undefined, both);
    expect(l.panel).toBe('aska:code');
    expect(codes(l)).toEqual(['W_LINEUP_AMBIGUOUS']);
    expect(l.diagnostics[0]).toMatchObject({ level: 'warning', message: 'code is both a saved panel and a persona; read as the panel', fix: 'To mean the persona, put code after another name (tester@sonnet code); to mean the panel, keep it first. Or rename one' });
  });

  it('says in the fix how to get the persona reading, and that reading works', () => {
    const l = lineup(['code', 'tester@sonnet'], undefined, both);
    expect(l.diagnostics[0]!.fix).toBe('To mean the persona, put code after another name (tester@sonnet code); to mean the panel, keep it first. Or rename one');
    const p = lineup(['tester@sonnet', 'code'], undefined, both);
    expect(p.panel).toBeNull();
    expect(p.panelists.map((r) => r.persona)).toEqual(['aska:tester', 'aska:code']);
    expect(codes(p)).toEqual([]);
  });

  it('does not warn when the name is only a panel', () => {
    expect(codes(lineup(['code', 'tester@sonnet']))).toEqual([]);
  });

  it('does not warn for a persona lineup', () => {
    expect(codes(lineup(['code', 'tester'], undefined, both))).toEqual([]);
  });
});
