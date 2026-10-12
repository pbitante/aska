import { sectionKey } from '../parse/sections';

const HEADING = /^ {0,3}##(?!#)\s+(.+?)(?:\s+#+)?\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// Indices of `## ` heading lines outside fenced code, matching the parser's notion of a heading.
function headings(lines: string[]): { index: number; key: string }[] {
  const out: { index: number; key: string }[] = [];
  let fence: string | undefined;
  lines.forEach((line, index) => {
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && line.trim() === f[1]) fence = undefined;
      return;
    }
    if (f) {
      fence = f[1];
      return;
    }
    const h = HEADING.exec(line);
    if (h) out.push({ index, key: sectionKey(h[1]!) });
  });
  return out;
}

// Whether `text` contains a `## ` heading line (outside fenced code); such a line would split
// the section it's written into when it lands in the body.
export function hasHeadingLine(text: string): boolean {
  return headings(text.split('\n')).length > 0;
}

const contentLines = (text: string): string[] => {
  const t = text.replace(/^\n+/, '').replace(/\s+$/, '');
  return t === '' ? [] : t.split('\n');
};

// Replaces the body of the `## heading` section (or the preamble before the first heading, for
// heading ""), leaving every other line untouched. A missing section is appended at the end.
export function replaceSection(body: string, heading: string, text: string): string {
  const lines = body.split('\n');
  const hs = headings(lines);
  const content = contentLines(text);
  if (heading === '') {
    const end = hs.length > 0 ? hs[0]!.index : lines.length;
    const rest = lines.slice(end);
    const out = ['', ...content, ...(rest.length > 0 ? ['', ...rest] : [''])].join('\n');
    return out.endsWith('\n') ? out : `${out}\n`;
  }
  const i = hs.findIndex((h) => h.key === sectionKey(heading));
  if (i < 0) {
    const trimmed = body.replace(/\s+$/, '');
    return `${trimmed}\n\n## ${heading}\n\n${content.join('\n')}\n`;
  }
  const start = hs[i]!.index;
  const end = i + 1 < hs.length ? hs[i + 1]!.index : lines.length;
  const after = lines.slice(end);
  const middle = content.length > 0 ? ['', ...content, ''] : [''];
  const out = [...lines.slice(0, start + 1), ...middle, ...after].join('\n');
  return out.endsWith('\n') ? out : `${out}\n`;
}
