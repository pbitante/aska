import { describe, expect, it } from 'vitest';
import { listRows } from '../../src/cli/list';
import { checkPanelFile } from '../../src/panel/panels';
import type { Registry } from '../../src/scopes/registry';
import { panelMd, personaMd, unitMd } from '../helpers/md';
import { registryFor } from '../helpers/scopes';

// Looks a panel up the way validate and list do, then checks it.
function resolvePanel(reg: Registry, ref: string) {
  const l = reg.lookup('panel', ref);
  if (!l.file) return { file: undefined, personas: [], diagnostics: [l.diagnostic!] };
  return { file: l.file, ...checkPanelFile(reg, l.file) };
}

const base = {
  'user/units/a.md': unitMd('a'),
  'user/personas/guardian.md': personaMd(['name: guardian', 'description: G.', 'units:', '  primary: [a]']),
  'acme/personas/accelerator.md': personaMd(['name: accelerator', 'description: A.', 'units:', '  primary: [a]']),
};

describe('panel resolution', () => {
  it('resolves a panel and its personas', () => {
    const { reg } = registryFor({ ...base, 'project/panels/release.md': panelMd('release', ['guardian', 'accelerator']) });
    const r = resolvePanel(reg, 'release');
    expect(r.diagnostics).toEqual([]);
    expect(r.personas.map((p) => p.canonical)).toEqual(['guardian', 'acme:accelerator']);
  });

  it('reports unresolvable references with the lookup fix', () => {
    const { reg } = registryFor({ ...base, 'project/panels/release.md': panelMd('release', ['guardian', 'gaurdian']) });
    const r = resolvePanel(reg, 'release');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E_PANEL_PERSONA']);
    expect(r.diagnostics[0]!.fix).toContain('guardian');
  });

  it('reports two spellings of the same persona', () => {
    const { reg } = registryFor({ ...base, 'project/panels/release.md': panelMd('release', ['accelerator', 'acme:accelerator']) });
    const ds = resolvePanel(reg, 'release').diagnostics;
    expect(ds.map((d) => d.code)).toEqual(['E_PANEL_PERSONA']);
    expect(ds[0]!.message).toBe('"acme:accelerator" and "accelerator" are the same persona (acme:accelerator)');
  });

  it('checks a specific panel file, including a shadowed one', () => {
    const { reg } = registryFor({
      ...base,
      'project/panels/release.md': panelMd('release', ['guardian', 'accelerator']),
      'user/panels/release.md': panelMd('release', ['guardian', 'nobody']),
    });
    const files = reg.all('panel');
    expect(files.map((f) => f.scope.kind)).toEqual(['project', 'user']);
    expect(checkPanelFile(reg, files[0]!).diagnostics).toEqual([]);
    expect(checkPanelFile(reg, files[1]!).diagnostics.map((d) => d.code)).toEqual(['E_PANEL_PERSONA']);
    expect(resolvePanel(reg, 'release').file!.scope.kind).toBe('project');
    const panels = listRows(reg).panels;
    expect(panels[1]!.shadowedBy).toBe(panels[0]!.path);
  });

  it('stays valid when it references a persona that is itself invalid', () => {
    const { reg } = registryFor({
      ...base,
      'user/personas/bad.md': personaMd(['name: bad', 'units:', '  primary: [a]']),
      'project/panels/release.md': panelMd('release', ['guardian', 'bad']),
    });
    const r = resolvePanel(reg, 'release');
    expect(r.diagnostics).toEqual([]);
  });

  it('reports an unknown panel name', () => {
    const { reg } = registryFor(base);
    expect(resolvePanel(reg, 'release').diagnostics.map((d) => d.code)).toEqual(['E_UNKNOWN_REF']);
  });
});
