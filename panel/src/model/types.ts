export type Severity = 'low' | 'medium' | 'high' | 'critical';
export const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high', 'critical'];
export const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);
// Plain code-point order, the same on every machine (unlike localeCompare).
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export type Tier = 'primary' | 'secondary' | 'deprioritized';
export const TIERS: readonly Tier[] = ['primary', 'secondary', 'deprioritized'];
export type EntryTier = Tier | 'exclude';

export type ScopeKind = 'project' | 'user' | 'plugin';

export interface Loc {
  file: string;
  line: number;
}

export interface UnitDoc {
  name: string;
  description: string;
  appliesWhen?: string;
  threshold: Severity;
  looksFor: string;
  questions: string[];
  redFlags: string[];
  goodLooksLike: string;
  loc: Loc;
}

export interface UnitEntry {
  ref: string;
  tier: EntryTier;
  threshold?: Severity;
  addQuestions?: string[];
  addRedFlags?: string[];
  note?: string;
  loc: Loc;
}

export interface Section {
  heading: string;
  key: string;
  text: string;
  loc: Loc;
}

export interface JudgmentSectionDecl {
  name: string;
  ask: string;
  loc: Loc;
}

export type CapabilityKind = 'skills' | 'mcp';

export interface CapabilityDecl {
  kind: CapabilityKind;
  name: string;
  when: string;
  loc: Loc;
}

export type OverrideValue = 'child' | 'parent';

export interface OverrideEntry {
  key: string;
  value: OverrideValue;
  loc: Loc;
  hint?: string;
}

export interface PersonaDoc {
  name: string;
  description?: string;
  extends?: string;
  extendsLoc?: Loc;
  units: UnitEntry[];
  primaryOrder?: { refs: string[]; loc: Loc };
  judgmentSections: JudgmentSectionDecl[];
  capabilities: CapabilityDecl[];
  tools: string[];
  overrides: OverrideEntry[];
  stance?: Section;
  tieBreaking?: Section;
  extraSections: Section[];
  loc: Loc;
}

export interface Scope {
  kind: ScopeKind;
  root: string;
  plugin?: string;
}

export type FileKind = 'persona' | 'unit' | 'panel';

export interface FileRef {
  kind: FileKind;
  name: string;
  scope: Scope;
  path: string;
  canonical: string;
}

export interface Shadow {
  kind: FileKind;
  name: string;
  used: FileRef;
  shadowed: FileRef[];
}
