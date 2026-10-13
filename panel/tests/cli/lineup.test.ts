import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { needsPluginData, parseArgv, run } from '../../src/cli/main';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

const persona = (name: string, extra: string[] = []) => personaMd([`name: ${name}`, `description: ${name}.`, ...extra, 'units:', '  primary: [a]']);

function cli(env: { pluginListUnavailableReason?: string } = {}) {
  const { root } = registryFor({
    'user/units/a.md': unitMd('a'),
    'user/personas/guardian.md': persona('guardian'),
    'user/personas/historian.md': persona('historian', ['model: haiku']),
    'user/panels/duo.md': panelMd('duo', ['guardian', 'historian']),
  });
  return (...argv: string[]) => {
    const out: string[] = [];
    const plugins = env.pluginListUnavailableReason ? { pluginListUnavailableReason: env.pluginListUnavailableReason } : { pluginListJson: '[]' };
    const code = run(argv, { cwd: join(root, 'proj'), home: join(root, 'home'), ...plugins, out: (s) => out.push(s) });
    return { code, text: out.join('\n') };
  };
}

describe('persona lineup', () => {
  it('prints the lineup as JSON and exits 0', () => {
    const r = cli()('lineup', '--json', '--model', 'sonnet', 'duo', 'historian@opus');
    expect(r.code).toBe(0);
    const j = JSON.parse(r.text) as { panel: string; panelists: unknown[]; diagnostics: unknown[] };
    expect(Object.keys(j)).toEqual(['panel', 'panelists', 'diagnostics']);
    expect(j.panel).toBe('duo');
    expect(j.panelists).toEqual([
      { persona: 'guardian', canonical: 'guardian', model: 'sonnet', modelSource: 'run' },
      { persona: 'historian', canonical: 'historian', model: 'opus', modelSource: 'panelist' },
    ]);
    expect(j.diagnostics).toEqual([]);
  });

  it('prints diagnostics and exits 1 on an error', () => {
    const r = cli()('lineup', '--json', 'guardian');
    expect(r.code).toBe(1);
    const j = JSON.parse(r.text) as { panel: null; panelists: unknown[]; diagnostics: { code: string }[] };
    expect(j.panel).toBeNull();
    expect(j.panelists).toEqual([]);
    expect(j.diagnostics.map((d) => d.code)).toEqual(['E_PANEL_SIZE']);
  });

  it('enforces its argument rules', () => {
    const c = cli();
    for (const argv of [
      ['lineup', 'guardian', 'historian'],
      ['lineup', '--json'],
      ['lineup', '--json', '--model'],
      ['lineup', '--json', '--model', 'haiku', '--model', 'opus', 'guardian', 'historian'],
      ['lineup', '--json', '--model', '--json', 'guardian', 'historian'],
      ['lineup', '--json', '--panel', 'guardian', 'historian'],
      ['lineup', '--json', '--file', 'x', 'guardian', 'historian'],
      ['lineup', '--json', '--scope', 'user', 'guardian', 'historian'],
      ['list', '--model', 'haiku'],
      ['compare', '--file', 'x', '--model', 'haiku'],
    ]) {
      expect(c(...argv).code, argv.join(' ')).toBe(2);
    }
  });

  it('needs plugin data, as list and the author commands do, and targets and runs do not', () => {
    const needs = (...argv: string[]) => needsPluginData(parseArgv(argv, '/'));
    expect(needs('lineup', '--json', 'duo')).toBe(true);
    expect(needs('list')).toBe(true);
    expect(needs('show', 'persona', 'guardian')).toBe(true);
    expect(needs('targets', '--from', 'x.md')).toBe(false);
    expect(needs('runs', 'list')).toBe(false);
    expect(needs('--help')).toBe(false);
  });

  it('reports a plugin-list failure as a warning, ahead of its own diagnostics', () => {
    const r = cli({ pluginListUnavailableReason: 'claude not found' })('lineup', '--json', 'guardian', 'historian');
    const j = JSON.parse(r.text) as { diagnostics: { level: string; code: string }[] };
    expect(j.diagnostics[0]).toMatchObject({ level: 'warning', code: 'W_PLUGIN_LIST' });
    expect(r.code).toBe(0);
  });

  it('is in the usage text', () => {
    expect(cli()('--help').text).toContain('lineup --json [--model <m>]');
  });
});
