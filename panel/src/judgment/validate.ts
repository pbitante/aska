import type { Target } from '../gate/targets';
import { effectiveThreshold, type EffUnit, type EffectivePersona } from '../model/effective';
import { SEVERITIES, TIERS, severityRank, type Severity } from '../model/types';

const VERDICTS = ['proceed', 'proceed-with-conditions', 'stop', 'insufficient-information'];
const TOP_KEYS = ['persona', 'verdict', 'conditions', 'missing', 'findings', 'cleared', 'not_applicable', 'sections', 'investigate', 'checks'];
const FINDING_KEYS = ['unit', 'severity', 'claim', 'evidence', 'suggestion', 'check'];
const CHECK_KEYS = ['id', 'status', 'evidence', 'needs'];
const CHECK_STATUSES = ['holds', 'broken', 'deferred'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isSeverity = (v: unknown): v is Severity => typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);

export function validateJudgment(p: EffectivePersona, j: unknown, targets?: readonly Target[]): string[] {
  if (!isObj(j)) return ['the judgment must be a JSON object'];
  const v: string[] = [];
  for (const k of Object.keys(j)) if (!TOP_KEYS.includes(k)) v.push(`unknown key "${k}"`);
  if (j.persona !== p.canonical) v.push(`persona must be "${p.canonical}"`);

  const verdict = j.verdict;
  const verdictValid = typeof verdict === 'string' && VERDICTS.includes(verdict);
  if (!verdictValid) v.push(`verdict must be one of ${VERDICTS.join(', ')}`);
  const conditional = (key: 'conditions' | 'missing', verdictNeeding: string) => {
    const needed = verdict === verdictNeeding;
    const value = j[key];
    if (needed && !(Array.isArray(value) && value.length > 0 && value.every(nonEmpty))) {
      v.push(`${key} must be a non-empty list of strings when the verdict is ${verdictNeeding}`);
    }
    if (!needed && value !== undefined) v.push(`${key} is only allowed when the verdict is ${verdictNeeding}`);
  };
  if (verdictValid) {
    conditional('conditions', 'proceed-with-conditions');
    conditional('missing', 'insufficient-information');
  }

  const active = new Map<string, EffUnit>();
  for (const t of TIERS) for (const u of p.units[t]) active.set(u.canonical, u);
  const flagged = new Set<string>();
  const severities: Severity[] = [];

  // Target id → status, for entries with a known id and a valid status (rules 1–2, used by 4–5).
  const status = new Map<string, string>();
  const linkedChecks = new Set<string>();
  const targetIds = targets?.map((t) => t.id) ?? [];
  if (targets === undefined) {
    if (j.checks !== undefined) v.push('checks is only allowed when a targets file is given');
  } else if (!Array.isArray(j.checks)) {
    v.push('checks must be a list with one entry per target');
  } else {
    const seen = new Set<string>();
    j.checks.forEach((c: unknown, i: number) => {
      const at = `checks[${i}]`;
      if (!isObj(c)) {
        v.push(`${at} must be an object`);
        return;
      }
      for (const k of Object.keys(c)) if (!CHECK_KEYS.includes(k)) v.push(`${at}: unknown key "${k}"`);
      const st = c.status;
      const stValid = typeof st === 'string' && CHECK_STATUSES.includes(st);
      if (!stValid) v.push(`${at}: status must be one of ${CHECK_STATUSES.join(', ')}`);
      if (typeof c.id !== 'string' || !targetIds.includes(c.id)) v.push(`${at}: id "${String(c.id)}" is not a target`);
      else if (seen.has(c.id)) v.push(`${at}: target ${c.id} is answered more than once`);
      else {
        seen.add(c.id);
        if (stValid) status.set(c.id, st as string);
      }
      if (!nonEmpty(c.evidence)) v.push(`${at}: evidence must be a non-empty string`);
      if (st === 'deferred' && !nonEmpty(c.needs)) v.push(`${at}: a deferred target needs a non-empty "needs"`);
      if ((st === 'holds' || st === 'broken') && c.needs !== undefined) v.push(`${at}: needs is only allowed when the status is deferred`);
    });
    for (const id of targetIds) if (!seen.has(id)) v.push(`target ${id} has no entry in checks`);
  }

  if (!Array.isArray(j.findings)) v.push('findings must be a list (use [] when there are none)');
  else {
    j.findings.forEach((f: unknown, i: number) => {
      const at = `findings[${i}]`;
      if (!isObj(f)) {
        v.push(`${at} must be an object`);
        return;
      }
      for (const k of Object.keys(f)) if (!FINDING_KEYS.includes(k)) v.push(`${at}: unknown key "${k}"`);
      const sev = f.severity;
      if (!isSeverity(sev)) v.push(`${at}: severity must be one of ${SEVERITIES.join(', ')}`);
      else severities.push(sev);
      if (!nonEmpty(f.claim)) v.push(`${at}: claim must be a non-empty string`);
      if (!nonEmpty(f.evidence)) v.push(`${at}: evidence must be a non-empty string`);
      if (f.suggestion !== undefined && typeof f.suggestion !== 'string') v.push(`${at}: suggestion must be a string`);
      let linked = false;
      if (f.check !== undefined) {
        if (targets === undefined) v.push(`${at}: check is only allowed when a targets file is given`);
        else if (typeof f.check !== 'string' || !targetIds.includes(f.check)) v.push(`${at}: check "${String(f.check)}" is not a target`);
        else {
          linked = true;
          linkedChecks.add(f.check);
          const st = status.get(f.check);
          if (st !== undefined && st !== 'broken') v.push(`${at}: check ${f.check} is not broken (its status is ${st})`);
        }
      }
      if (f.unit === 'outside-scope') {
        if (!linked && sev !== 'critical') v.push(`${at}: outside-scope findings must be critical`);
        return;
      }
      if (f.unit === undefined) {
        v.push(`${at}: unit is required`);
        return;
      }
      const u = typeof f.unit === 'string' ? active.get(f.unit) : undefined;
      if (!u) {
        v.push(`${at}: unit "${String(f.unit)}" is not one of this persona's concerns`);
        return;
      }
      flagged.add(u.canonical);
      if (linked) return;
      const threshold = effectiveThreshold(u);
      if (isSeverity(sev) && severityRank(sev) < severityRank(threshold)) {
        v.push(`${at}: severity ${sev} is below the ${threshold} threshold of ${u.canonical}`);
      }
    });
  }

  if (targets !== undefined && Array.isArray(j.checks)) {
    j.checks.forEach((c: unknown, i: number) => {
      if (isObj(c) && c.status === 'broken' && typeof c.id === 'string' && targetIds.includes(c.id) && !linkedChecks.has(c.id)) {
        v.push(`checks[${i}]: broken target ${c.id} needs a finding with "check": "${c.id}"`);
      }
    });
  }

  const primary = p.units.primary.map((u) => u.canonical);
  const count = new Map<string, number>(primary.map((id) => [id, flagged.has(id) ? 1 : 0]));
  if (!Array.isArray(j.cleared)) v.push('cleared must be a list (use [] when empty)');
  else {
    j.cleared.forEach((c: unknown, i: number) => {
      if (typeof c !== 'string' || !primary.includes(c)) v.push(`cleared[${i}]: "${String(c)}" is not a primary concern`);
      else count.set(c, count.get(c)! + 1);
    });
  }
  if (!Array.isArray(j.not_applicable)) v.push('not_applicable must be a list (use [] when empty)');
  else {
    j.not_applicable.forEach((n: unknown, i: number) => {
      const at = `not_applicable[${i}]`;
      if (!isObj(n)) {
        v.push(`${at} must be an object`);
        return;
      }
      for (const k of Object.keys(n)) if (k !== 'unit' && k !== 'reason') v.push(`${at}: unknown key "${k}"`);
      if (typeof n.unit === 'string' && primary.includes(n.unit)) count.set(n.unit, count.get(n.unit)! + 1);
      else v.push(`${at}: unit "${String(n.unit)}" is not a primary concern`);
      if (!nonEmpty(n.reason)) v.push(`${at}: reason must be a non-empty string`);
    });
  }
  for (const id of primary) {
    const n = count.get(id)!;
    if (n === 0) v.push(`primary concern ${id} must appear in findings, cleared, or not_applicable`);
    else if (n > 1) v.push(`primary concern ${id} must appear in exactly one of findings, cleared, not_applicable`);
  }

  if (verdict === 'stop' && !severities.some((s) => s === 'high' || s === 'critical')) v.push('a stop verdict needs at least one high or critical finding');
  if (verdict === 'proceed' && severities.includes('critical')) v.push('proceed is not allowed while a critical finding stands');
  if (verdict === 'proceed' && [...status.values()].includes('broken')) v.push('proceed is not allowed while a target is broken');

  const names = p.judgmentSections.map((s) => s.name);
  if (j.sections === undefined) {
    if (names.length > 0) v.push(`sections must have keys: ${names.join(', ')}`);
  } else if (!isObj(j.sections)) {
    v.push('sections must be an object');
  } else {
    const sections = j.sections;
    for (const n of names) if (!nonEmpty(sections[n])) v.push(`sections["${n}"] must be a non-empty string`);
    for (const k of Object.keys(sections)) if (!names.includes(k)) v.push(`sections has unknown key "${k}"`);
  }

  if (j.investigate !== undefined) {
    if (!Array.isArray(j.investigate)) v.push('investigate must be a list');
    else {
      j.investigate.forEach((it: unknown, i: number) => {
        const at = `investigate[${i}]`;
        if (!isObj(it)) {
          v.push(`${at} must be an object`);
          return;
        }
        for (const k of Object.keys(it)) if (k !== 'what' && k !== 'why' && k !== 'tools') v.push(`${at}: unknown key "${k}"`);
        if (!nonEmpty(it.what)) v.push(`${at}: what must be a non-empty string`);
        if (!nonEmpty(it.why)) v.push(`${at}: why must be a non-empty string`);
        if (!(Array.isArray(it.tools) && it.tools.length > 0 && it.tools.every(nonEmpty))) {
          v.push(`${at}: tools must be a non-empty list of tool names`);
        }
      });
    }
  }
  return v;
}
