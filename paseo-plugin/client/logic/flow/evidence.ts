import { judgmentSchema } from "../../../shared/runs";
import { shortPersona } from "../report";

export const GIT_REFS = "git refs";

export interface EvidenceItem {
  id: string;
  label: string;
  citedBy: string[];
  count: number;
  readBy?: number;
}
export interface EvidenceSet {
  items: EvidenceItem[];
  byPanelist: Record<string, string[]>;
}

const FILE_EXT = /\.(md|txt|diff|patch|json|yaml|yml|toml|ts|tsx|js|mjs|py|go|rs|sh|sql)$/i;

// "**Materials** (repository root: /x)" or "the repository itself is at `/x`".
export function briefRoot(brief: string | null): string | null {
  if (!brief) return null;
  const m = /repository (?:root:|itself is at)\s*`?(\/[^\s`)]+)/i.exec(brief);
  return m ? m[1]!.replace(/\/+$/, "") : null;
}

// One token of free-text evidence → a stable item id, or null when it isn't a file-like reference.
export function normalizeRef(token: string, root: string | null, runDir: string | null): string | null {
  let t = token.replace(/^[[(<'"`]+/, "").replace(/[\])>'"`.,;:]+$/, "");
  t = t.replace(/:\d+(?:[-–]\d+)?(?:,\d+(?:[-–]\d+)?)*$/, "");
  const pathy = (t.includes("/") && /[A-Za-z]/.test(t) && !/^https?:/i.test(t)) || FILE_EXT.test(t);
  if (!pathy) return null;
  for (const base of [runDir, root]) {
    if (base && t.startsWith(`${base}/`)) t = t.slice(base.length + 1);
  }
  if (t === root || t === runDir) return null;
  t = t.replace(/\/+$/, "");
  if (t === ".git" || t.startsWith(".git/") || t.includes("/.git/") || t.endsWith("/.git") || t.startsWith("refs/")) return GIT_REFS;
  return t === "" ? null : t;
}

export function evidenceRefs(text: string, root: string | null, runDir: string | null): string[] {
  const out: string[] = [];
  for (const token of text.split(/[\s,;()]+/)) {
    const ref = normalizeRef(token, root, runDir);
    if (ref !== null && !out.includes(ref)) out.push(ref);
  }
  return out;
}

// The "- …" lines under **Materials**, up to the next bold heading: the first file-like token of each.
export function briefMaterials(brief: string | null, root: string | null, runDir: string | null): string[] {
  if (!brief) return [];
  const lines = brief.split("\n");
  const start = lines.findIndex((l) => /\*\*Materials\*\*/.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\*\*[^*]+\*\*/.test(line)) break;
    if (!/^\s*-\s/.test(line)) continue;
    const ref = evidenceRefs(line.replace(/^\s*-\s/, ""), root, runDir)[0];
    if (ref !== undefined && !out.includes(ref)) out.push(ref);
  }
  return out;
}

interface Tally {
  id: string;
  citedBy: string[];
  count: number;
  first: number;
}

export const labelOf = (id: string): string => (id === GIT_REFS ? GIT_REFS : (id.split("/").pop() ?? id));

export function collectEvidence(judgments: readonly { persona: string; judgment?: unknown }[], brief: string | null, runDir: string | null): EvidenceSet {
  const root = briefRoot(brief);
  const materials = briefMaterials(brief, root, runDir);
  const tally = new Map<string, Tally>();
  for (const j of judgments) {
    const parsed = judgmentSchema.safeParse(j.judgment);
    if (!parsed.success) continue;
    const who = shortPersona(j.persona);
    for (const finding of parsed.data.findings ?? []) {
      for (const ref of evidenceRefs(finding.evidence ?? "", root, runDir)) {
        const t = tally.get(ref) ?? { id: ref, citedBy: [], count: 0, first: tally.size };
        if (!t.citedBy.includes(who)) t.citedBy.push(who);
        t.count++;
        tally.set(ref, t);
      }
    }
  }
  const ranked = [...tally.values()].sort((a, b) => b.citedBy.length - a.citedBy.length || b.count - a.count || a.first - b.first);
  const materialIndex = (id: string): number => {
    const i = materials.findIndex((m) => m === id || labelOf(m) === labelOf(id));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const display = ranked
    .map((t, rank) => ({ t, rank }))
    .sort((a, b) => materialIndex(a.t.id) - materialIndex(b.t.id) || a.rank - b.rank)
    .map(({ t }) => t);
  const byPanelist: Record<string, string[]> = {};
  for (const t of display) {
    for (const who of t.citedBy) (byPanelist[who] ??= []).push(t.id);
  }
  return {
    items: display.map((t) => ({ id: t.id, label: labelOf(t.id), citedBy: [...t.citedBy].sort(), count: t.count })),
    byPanelist,
  };
}
