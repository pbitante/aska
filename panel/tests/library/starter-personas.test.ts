import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkPanelFile } from '../../src/panel/panels';
import { resolvePersona } from '../../src/resolve/resolve';
import { Registry } from '../../src/scopes/registry';
import { panelTools } from '../../src/render/targets';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const reg = new Registry([{ kind: 'plugin', root: repo, plugin: 'aska' }]);

const PERSONAS = ['guardian', 'accelerator', 'maintainer', 'advocate', 'tester', 'red-team', 'planner', 'on-call', 'model-skeptic', 'ai-economist', 'historian', 'trimmer', 'gate'];

describe('starter personas', () => {
  it('ships exactly the thirteen starter personas', () => {
    expect(reg.all('persona').map((f) => f.name).sort()).toEqual([...PERSONAS].sort());
  });

  for (const name of PERSONAS) {
    it(`${name} resolves with no diagnostics, using only aska units`, () => {
      const r = resolvePersona(reg, `aska:${name}`);
      expect(r.diagnostics).toEqual([]);
      const units = Object.values(r.effective!.units).flat();
      expect(units.length).toBeGreaterThan(0);
      for (const u of units) expect(u.canonical, `${name} → ${u.canonical}`).toMatch(/^aska:/);
    });
  }

  it('historian leads with commit-history at threshold low and asks for a proposed history', () => {
    const e = resolvePersona(reg, 'aska:historian').effective!;
    expect(e.units.primary[0]!.canonical).toBe('aska:commit-history');
    expect(e.units.primary[0]!.thresholdSet).toBe('low');
    const section = e.judgmentSections.find((j) => j.name === 'Proposed history');
    expect(section).toBeDefined();
    for (const s of ['pick', 'fixup', 'squash', 'reword', 'Leave as is']) expect(section!.ask).toContain(s);
  });

  it('trimmer leads with necessity and asks for proposed cuts', () => {
    const e = resolvePersona(reg, 'aska:trimmer').effective!;
    expect(e.units.primary[0]!.canonical).toBe('aska:necessity');
    expect(e.units.primary.map((u) => u.canonical)).toEqual(['aska:necessity', 'aska:comment-noise', 'aska:scope-creep']);
    const section = e.judgmentSections.find((j) => j.name === 'Cuts');
    expect(section).toBeDefined();
    expect(section!.ask).toContain('what to delete or inline');
  });

  it('tester holds spec-conformance at threshold low, right after test-evidence', () => {
    const e = resolvePersona(reg, 'aska:tester').effective!;
    expect(e.units.primary.map((u) => u.canonical)).toEqual(['aska:test-evidence', 'aska:spec-conformance', 'aska:edge-cases', 'aska:maintainability']);
    expect(e.units.primary[1]!.thresholdSet).toBe('low');
    expect(e.tieBreaking.text).toContain('spec-conformance');
  });

  it('maintainer holds release-readiness and observability at threshold low', () => {
    const e = resolvePersona(reg, 'aska:maintainer').effective!;
    expect(e.units.primary.map((u) => u.canonical)).toEqual(['aska:security', 'aska:release-readiness', 'aska:maintainability', 'aska:observability']);
    expect(e.units.primary.find((u) => u.canonical === 'aska:observability')!.thresholdSet).toBe('low');
    expect(e.tieBreaking.text).toContain('release-readiness');
  });

  it('gate leads with security in its primary order, needs Bash, and keeps scope-creep and maintainability quiet', () => {
    const e = resolvePersona(reg, 'aska:gate').effective!;
    expect(e.units.primary.map((u) => u.canonical)).toEqual(['aska:security', 'aska:data-integrity', 'aska:spec-conformance', 'aska:edge-cases', 'aska:test-evidence']);
    expect(e.units.secondary.map((u) => u.canonical)).toEqual(['aska:privacy', 'aska:llm-behavior', 'aska:rollback-safety', 'aska:dependencies', 'aska:performance']);
    expect(e.units.deprioritized.map((u) => u.canonical)).toEqual(['aska:maintainability', 'aska:scope-creep']);
    expect(panelTools(e)).toEqual(['Read', 'Grep', 'Glob', 'Bash']);
    expect(e.stance.text).toContain('Never change the working tree');
  });

  it('covers every starter unit between them', () => {
    const held = new Set(PERSONAS.flatMap((n) => Object.values(resolvePersona(reg, `aska:${n}`).effective!.units).flat().map((u) => u.canonical)));
    const all = reg.all('unit').map((f) => `aska:${f.name}`).sort();
    expect([...held].sort()).toEqual(all);
  });
});

const PANELS: Record<string, string[]> = {
  ship: ['guardian', 'accelerator', 'maintainer'],
  code: ['guardian', 'tester', 'red-team', 'maintainer', 'historian'],
  'code-lean': ['guardian', 'tester', 'red-team', 'maintainer'],
  plan: ['planner', 'guardian', 'accelerator'],
  llm: ['model-skeptic', 'ai-economist', 'red-team'],
  ops: ['on-call', 'guardian', 'maintainer'],
  trim: ['trimmer', 'maintainer', 'guardian'],
};

describe('shipped panels', () => {
  const panels = reg.all('panel');

  it('ships exactly the seven per-use panels, and no default panel', () => {
    expect(panels.map((f) => f.name).sort()).toEqual(Object.keys(PANELS).sort());
    expect(panels.some((f) => f.name === 'default')).toBe(false);
  });

  it('trim asks for an aska:code review of any cut that changes file writes, permissions or process handling', () => {
    const r = checkPanelFile(reg, panels.find((f) => f.name === 'trim')!);
    expect(r.panel!.notes).toMatch(/aska:code[^.]*file writes, permissions or process handling/);
  });

  for (const [name, members] of Object.entries(PANELS)) {
    it(`${name} validates and lists ${members.join(', ')}`, () => {
      const r = checkPanelFile(reg, panels.find((f) => f.name === name)!);
      expect(r.diagnostics).toEqual([]);
      expect(r.panel!.personas.map((p) => p.ref)).toEqual(members.map((m) => `aska:${m}`));
    });
  }
});
