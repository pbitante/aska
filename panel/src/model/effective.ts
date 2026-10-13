import type { Diagnostic } from '../diagnostics';
import type { CapabilityKind, FileRef, Loc, OverrideValue, PanelModel, ScopeKind, Section, Severity, Shadow, Tier, UnitDoc } from './types';

export interface EffUnit {
  canonical: string;
  unit: UnitDoc;
  tier: Tier;
  thresholdSet?: Severity;
  addQuestions: string[];
  addRedFlags: string[];
  note?: string;
}

export const effectiveThreshold = (u: EffUnit): Severity =>
  u.tier === 'deprioritized' ? 'critical' : (u.thresholdSet ?? u.unit.threshold);

type Decision = OverrideValue | 'unreviewed';

export interface Clash {
  id: string;
  layer: FileRef;
  child: string;
  parent: string;
  decision: Decision;
  dropped: string[];
  loc: Loc;
}

export interface StaleOverride {
  layer: FileRef;
  key: string;
  id: string;
  loc: Loc;
  hint?: string;
}

export interface ClashReport {
  clashes: Clash[];
  stale: StaleOverride[];
  shadows: Shadow[];
}

export interface EffectivePersona {
  name: string;
  canonical: string;
  description: string;
  model: PanelModel | null;
  source: string;
  sourceId: string;
  units: Record<Tier, EffUnit[]>;
  stance: Section;
  tieBreaking: Section;
  extraSections: Section[];
  judgmentSections: { name: string; ask: string }[];
  capabilities: { kind: CapabilityKind; name: string; when: string }[];
  tools: string[];
  inputs: string[];
  inputIds: string[];
  inputScopes: ScopeKind[];
}

export function inputId(f: FileRef): string {
  const scope = f.scope.kind === 'plugin' ? `plugin:${f.scope.plugin}` : f.scope.kind;
  return `${scope}/${f.name}.${f.kind}.md`;
}

export interface Resolution {
  effective?: EffectivePersona;
  report: ClashReport;
  diagnostics: Diagnostic[];
}
