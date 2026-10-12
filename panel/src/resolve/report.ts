import type { ClashReport } from '../model/effective';
import type { FileRef } from '../model/types';
import { overrideLine } from './format';

const local = (f: FileRef): boolean => f.scope.kind !== 'plugin';
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function activationLine(canonical: string, report: ClashReport): string | undefined {
  const unreviewed = report.clashes.filter((c) => c.decision === 'unreviewed' && local(c.layer)).length;
  const stale = report.stale.filter((s) => local(s.layer)).length;
  if (unreviewed === 0 && stale === 0) return undefined;
  const parts = [unreviewed ? plural(unreviewed, 'unreviewed override') : '', stale ? plural(stale, 'stale override') : ''].filter(Boolean);
  return `${canonical}: ${parts.join(', ')} — run persona explain ${canonical}`;
}

export function formatReport(report: ClashReport): string {
  const lines: string[] = [];
  if (report.clashes.length > 0) {
    lines.push('Clashes:');
    for (const c of report.clashes) {
      lines.push(`  [${c.decision}] ${c.id}  child: ${c.child}  parent: ${c.parent}  (${c.layer.canonical}, ${c.layer.scope.kind})`);
      if (c.dropped.length > 0) lines.push(`      dropped: ${c.dropped.join('; ')}`);
      if (c.decision === 'unreviewed') lines.push(`      keep: add ${overrideLine(c.id, 'child')} under overrides in ${c.layer.path}; flip: ${overrideLine(c.id, 'parent')}`);
    }
  }
  if (report.stale.length > 0) {
    lines.push('Stale overrides:');
    for (const s of report.stale) lines.push(`  ${s.key} in ${s.layer.path}:${s.loc.line} matches no clash`);
  }
  if (report.shadows.length > 0) {
    lines.push('Shadows (informational):');
    for (const s of report.shadows) {
      const pins = s.shadowed.filter((f) => f.scope.kind === 'plugin').map((f) => f.canonical);
      const others = s.shadowed.map((f) => `${f.scope.kind} (${f.path})`).join(', ');
      lines.push(`  ${s.kind} ${s.name}: using ${s.used.scope.kind} (${s.used.path}); shadows ${others}${pins.length > 0 ? `; pin with ${pins.join(' or ')}` : ''}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'No clashes, stale overrides or shadows.';
}
