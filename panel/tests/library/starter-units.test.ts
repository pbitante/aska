import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseUnit } from '../../src/parse/unit';
import { Registry } from '../../src/scopes/registry';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const reg = new Registry([{ kind: 'plugin', root: repo, plugin: 'aska' }]);

const EXPECTED: Record<string, string> = {
  'accessibility-ux': 'medium',
  cost: 'medium',
  'data-integrity': 'low',
  'delivery-speed': 'medium',
  'edge-cases': 'medium',
  maintainability: 'medium',
  observability: 'medium',
  performance: 'medium',
  'rollback-safety': 'medium',
  'scope-creep': 'medium',
  security: 'low',
  'user-value': 'medium',
  'test-evidence': 'medium',
  privacy: 'low',
  dependencies: 'medium',
  'plan-executability': 'medium',
  'llm-behavior': 'low',
  'eval-evidence': 'medium',
  'commit-history': 'medium',
  necessity: 'low',
  'comment-noise': 'medium',
  'spec-conformance': 'medium',
  'release-readiness': 'low',
};
const NO_APPLIES_WHEN = ['maintainability', 'scope-creep', 'user-value', 'delivery-speed'];
const ROLE_WORDS = /\b(dev(eloper)?s?|QA|PMs?|product managers?|testers?|manage(r|rs|ment)|engineer(s|ing)?|designers?)\b/i;

const PAIRS: [string, string][] = [
  ['data-integrity', 'rollback-safety'],
  ['edge-cases', 'security'],
  ['performance', 'cost'],
  ['scope-creep', 'delivery-speed'],
  ['maintainability', 'scope-creep'],
  ['observability', 'rollback-safety'],
  ['accessibility-ux', 'user-value'],
  ['edge-cases', 'data-integrity'],
  ['security', 'privacy'],
  ['security', 'dependencies'],
  ['test-evidence', 'edge-cases'],
  ['plan-executability', 'scope-creep'],
  ['llm-behavior', 'security'],
  ['eval-evidence', 'test-evidence'],
  ['commit-history', 'maintainability'],
  ['necessity', 'maintainability'],
  ['comment-noise', 'maintainability'],
  ['necessity', 'scope-creep'],
  ['release-readiness', 'privacy'],
  ['release-readiness', 'dependencies'],
];

const units = new Map(
  reg.all('unit').map((f) => [f.name, parseUnit(f.path, readFileSync(f.path, 'utf8')).unit!]),
);

describe('starter unit library', () => {
  it('contains exactly the 23 expected units', () => {
    expect(reg.all('unit').map((f) => f.name).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(reg.diagnostics).toEqual([]);
  });

  for (const f of reg.all('unit')) {
    it(`${f.name} is valid, role-neutral and well-formed`, () => {
      const raw = readFileSync(f.path, 'utf8');
      const r = parseUnit(f.path, raw);
      expect(r.diagnostics).toEqual([]);
      const u = r.unit!;
      expect(u.threshold).toBe(EXPECTED[f.name]);
      expect(u.questions.length).toBeGreaterThanOrEqual(2);
      expect(u.questions.length).toBeLessThanOrEqual(4);
      expect(u.redFlags.length).toBeGreaterThanOrEqual(2);
      expect(u.redFlags.length).toBeLessThanOrEqual(4);
      expect(u.goodLooksLike.split('\n')).toHaveLength(1);
      expect(Boolean(u.appliesWhen)).toBe(!NO_APPLIES_WHEN.includes(f.name));
      expect(raw).not.toMatch(ROLE_WORDS);
    });
  }

  for (const [a, b] of PAIRS) {
    it(`${a} and ${b} each name the other as a boundary in "Looks for"`, () => {
      expect(units.get(a)!.looksFor).toContain(b);
      expect(units.get(b)!.looksFor).toContain(a);
    });
  }

  it('no two units ask an identical question', () => {
    const seenBy = new Map<string, string>();
    for (const [name, u] of units) {
      for (const q of u.questions) {
        const normalized = q.trim().toLowerCase();
        const owner = seenBy.get(normalized);
        expect(owner, `"${q}" in ${name} duplicates the question in ${owner}`).toBeUndefined();
        seenBy.set(normalized, name);
      }
    }
  });

  it('security rates a cloned repository\'s persistent reach as at least medium and flags writes through links', () => {
    const u = units.get('security')!;
    expect(u.looksFor).toContain('at least `medium`');
    expect(u.redFlags.some((f) => /symlink/.test(f) && /root/.test(f))).toBe(true);
  });

  it('spec-conformance treats commit messages, README and usage text as the contract when there is no spec', () => {
    const u = units.get('spec-conformance')!;
    expect(u.appliesWhen).toContain('commit messages, README and usage text');
    expect(u.redFlags.some((f) => /usage text/.test(f))).toBe(true);
  });

  it('test-evidence asks whether the default test run depends on the machine it runs on', () => {
    expect(units.get('test-evidence')!.questions.some((q) => /default test run/.test(q))).toBe(true);
  });

  it('release-readiness applies when code is about to be published', () => {
    const u = units.get('release-readiness')!;
    expect(u.appliesWhen).toMatch(/publish/);
    for (const s of ['licence', 'fixture', 'history']) expect(`${u.looksFor} ${u.redFlags.join(' ')}`).toContain(s);
  });
});
