import type { Loc } from './model/types';

type Level = 'error' | 'warning';

export interface Diagnostic {
  level: Level;
  code: string;
  message: string;
  loc?: Loc;
  fix?: string;
}

export function err(code: string, message: string, loc?: Loc, fix?: string): Diagnostic {
  return { level: 'error', code, message, loc, fix };
}

export function warn(code: string, message: string, loc?: Loc, fix?: string): Diagnostic {
  return { level: 'warning', code, message, loc, fix };
}

export function hasErrors(ds: readonly Diagnostic[]): boolean {
  return ds.some((d) => d.level === 'error');
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.loc ? ` ${d.loc.file}:${d.loc.line}` : '';
  const head = `${d.level} ${d.code}${where} — ${d.message}`;
  return d.fix ? `${head}\n    fix: ${d.fix}` : head;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

export function didYouMean(name: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = distance(name, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(name.length / 3)) ? best : undefined;
}
