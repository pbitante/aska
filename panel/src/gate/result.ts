import { severityRank, type Severity } from '../model/types';
import type { Target } from './targets';

type GateOutcome = 'pass' | 'pass-with-conditions' | 'fail';

export interface GateResult {
  result: GateOutcome;
  broken: string[];
  deferred: { id: string; needs: string }[];
  conditions: string[];
  findings_outside_targets: { unit: string; severity: string; claim: string }[];
  violations: string[];
}

interface Finding {
  unit: string;
  severity: Severity;
  claim: string;
  check?: string;
}
interface Check {
  id: string;
  status: 'holds' | 'broken' | 'deferred';
  needs?: string;
}
interface ValidJudgment {
  verdict: string;
  conditions?: string[];
  findings: Finding[];
  checks: Check[];
}

const bySeverity = (a: { severity: string }, b: { severity: string }) => severityRank(b.severity as Severity) - severityRank(a.severity as Severity);

// The judgment must already be valid against the targets whenever `violations` is empty
// (validateJudgment with the same targets); an invalid judgment always fails the gate.
export function gateResult(judgment: unknown, violations: string[], targets: readonly Target[]): GateResult {
  if (violations.length > 0) return { result: 'fail', broken: [], deferred: [], conditions: [], findings_outside_targets: [], violations };
  const j = judgment as ValidJudgment;
  const order = targets.map((t) => t.id);
  const checks = [...j.checks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const broken = checks.filter((c) => c.status === 'broken').map((c) => c.id);
  const deferred = checks.filter((c) => c.status === 'deferred').map((c) => ({ id: c.id, needs: c.needs! }));
  const conditions = j.conditions ?? [];
  const findings_outside_targets = j.findings
    .filter((f) => f.check === undefined)
    .map((f) => ({ unit: f.unit, severity: f.severity, claim: f.claim }))
    .sort(bySeverity);
  const failed = broken.length > 0 || j.verdict === 'stop' || j.verdict === 'insufficient-information';
  const result: GateOutcome = failed ? 'fail' : j.verdict === 'proceed-with-conditions' || deferred.length > 0 ? 'pass-with-conditions' : 'pass';
  return { result, broken, deferred, conditions, findings_outside_targets, violations: [] };
}

export function formatGate(r: GateResult, judgment: unknown): string {
  if (r.violations.length > 0) return ['FAIL — invalid judgment', ...r.violations.map((v) => `- ${v}`)].join('\n');
  const j = judgment as ValidJudgment;
  const linked = (id: string) => j.findings.filter((f) => f.check === id).sort(bySeverity);
  const parts: string[] = [];
  let headline: string;
  if (r.result === 'fail') {
    for (const id of r.broken) {
      const top = linked(id)[0]!;
      parts.push(`${id} broken (${top.severity}: ${top.claim})`);
    }
    if (j.verdict === 'stop' || j.verdict === 'insufficient-information') parts.push(`verdict ${j.verdict}`);
    headline = `FAIL — ${parts.join('; ')}`;
  } else if (r.result === 'pass-with-conditions') {
    for (const d of r.deferred) parts.push(`${d.id} deferred (needs: ${d.needs})`);
    if (r.conditions.length > 0) parts.push(`${r.conditions.length} condition${r.conditions.length === 1 ? '' : 's'}`);
    headline = `PASS WITH CONDITIONS — ${parts.join('; ')}`;
  } else {
    headline = 'PASS';
  }
  const lines = [headline];
  if (r.broken.length > 0) {
    lines.push('', 'Broken:');
    for (const id of r.broken) for (const f of linked(id)) lines.push(`- ${id} [${f.severity}] ${f.unit}: ${f.claim}`);
  }
  if (r.deferred.length > 0) lines.push('', 'Deferred:', ...r.deferred.map((d) => `- ${d.id}: ${d.needs}`));
  if (r.conditions.length > 0) lines.push('', 'Conditions:', ...r.conditions.map((c) => `- ${c}`));
  if (r.findings_outside_targets.length > 0) lines.push('', 'Other findings:', ...r.findings_outside_targets.map((f) => `- [${f.severity}] ${f.unit}: ${f.claim}`));
  return lines.join('\n');
}
