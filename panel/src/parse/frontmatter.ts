import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import { err, type Diagnostic } from '../diagnostics';

export interface Frontmatter {
  data: Record<string, unknown>;
  lineOf(path: readonly (string | number)[]): number;
  body: string;
  bodyStartLine: number;
}

export function normalizeSource(src: string): string {
  return src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function splitFrontmatter(file: string, raw: string): { fm?: Frontmatter; diagnostics: Diagnostic[] } {
  const lines = normalizeSource(raw).split('\n');
  const fail = (message: string, line: number, fix: string) => ({
    diagnostics: [err('E_FRONTMATTER', message, { file, line }, fix)],
  });
  if (lines[0]?.trim() !== '---') {
    return fail('file must start with a --- frontmatter block', 1, 'Add a frontmatter block delimited by --- lines at the top of the file');
  }
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close < 0) return fail('frontmatter block is not closed', 1, 'Add a closing --- line after the frontmatter');

  const lineCounter = new LineCounter();
  const doc = parseDocument(lines.slice(1, close).join('\n'), { lineCounter });
  if (doc.errors.length > 0) {
    const e = doc.errors[0]!;
    const line = (e.linePos?.[0]?.line ?? 1) + 1;
    return fail(`invalid YAML: ${e.message.split('\n')[0]}`, line, 'Fix the YAML syntax in the frontmatter');
  }
  if (!isMap(doc.contents)) {
    return fail('frontmatter must be a YAML mapping of fields', 2, 'Write the frontmatter as key: value lines');
  }

  const lineOf = (path: readonly (string | number)[]): number => {
    for (let p = [...path]; p.length > 0; p = p.slice(0, -1)) {
      const last = p[p.length - 1]!;
      if (typeof last === 'string') {
        const parent = p.length > 1 ? doc.getIn(p.slice(0, -1), true) : doc.contents;
        if (isMap(parent)) {
          const pair = parent.items.find((it) => isScalar(it.key) && it.key.value === last);
          const range = (pair?.key as { range?: [number, number, number] } | undefined)?.range;
          if (range) return lineCounter.linePos(range[0]).line + 1;
        }
      }
      const node = doc.getIn(p, true) as { range?: [number, number, number] } | undefined;
      if (node && typeof node === 'object' && node.range) return lineCounter.linePos(node.range[0]).line + 1;
    }
    return 2;
  };

  let data: Record<string, unknown>;
  try {
    data = doc.toJS() as Record<string, unknown>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(`invalid YAML: ${message}`, 2, 'Fix the YAML syntax in the frontmatter');
  }

  return {
    fm: {
      data,
      lineOf,
      body: lines.slice(close + 1).join('\n'),
      bodyStartLine: close + 2,
    },
    diagnostics: [],
  };
}
