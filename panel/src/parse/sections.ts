export interface RawSection {
  heading: string;
  key: string;
  text: string;
  line: number;
  textLine: number;
}

export interface SplitBody {
  preamble?: { text: string; line: number };
  sections: RawSection[];
  unclosedFence?: { line: number };
}

export const sectionKey = (heading: string): string => heading.trim().replace(/\s+/g, ' ').toLowerCase();

const HEADING = /^ {0,3}##(?!#)\s+(.+?)(?:\s+#+)?\s*$/;
const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/;

interface Open {
  heading: string;
  line: number;
  lines: string[];
}

function finish(c: Open): RawSection {
  let start = 0;
  let end = c.lines.length;
  while (start < end && c.lines[start]!.trim() === '') start++;
  while (end > start && c.lines[end - 1]!.trim() === '') end--;
  return {
    heading: c.heading,
    key: sectionKey(c.heading),
    text: c.lines.slice(start, end).join('\n'),
    line: c.line,
    textLine: c.line + 1 + start,
  };
}

export function splitSections(body: string, bodyStartLine: number): SplitBody {
  const sections: RawSection[] = [];
  const pre: string[] = [];
  let preLine = -1;
  let current: Open | undefined;
  let fence: { char: string; len: number; line: number } | undefined;

  const absorb = (line: string, fileLine: number) => {
    if (current) current.lines.push(line);
    else if (line.trim() !== '') {
      if (preLine < 0) preLine = fileLine;
      pre.push(line);
    }
  };

  body.split('\n').forEach((line, i) => {
    const fileLine = bodyStartLine + i;
    if (fence) {
      const close = CLOSE_FENCE.exec(line);
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.len) fence = undefined;
      absorb(line, fileLine);
      return;
    }
    const open = OPEN_FENCE.exec(line);
    if (open && !(open[1]!.startsWith('`') && open[2]!.includes('`'))) {
      fence = { char: open[1]![0]!, len: open[1]!.length, line: fileLine };
      absorb(line, fileLine);
      return;
    }
    const h = HEADING.exec(line);
    if (h) {
      if (current) sections.push(finish(current));
      current = { heading: h[1]!, line: fileLine, lines: [] };
      return;
    }
    absorb(line, fileLine);
  });
  if (current) sections.push(finish(current));

  return {
    preamble: pre.length > 0 ? { text: pre.join('\n'), line: preLine } : undefined,
    sections,
    unclosedFence: fence ? { line: fence.line } : undefined,
  };
}

export function parseList(text: string, startLine: number): { items: string[]; badLine?: number; badEmpty?: boolean } {
  const items: string[] = [];
  let badLine: number | undefined;
  let badEmpty = false;
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      items.push(bullet[1]!.trim());
      return;
    }
    // A bullet marker with nothing after it is a distinct, more specific error than
    // ordinary stray text, so it gets its own flag for a more accurate fix message.
    if (/^\s{0,3}[-*+]\s*$/.test(line)) {
      if (badLine === undefined) {
        badLine = startLine + i;
        badEmpty = true;
      }
      return;
    }
    // Indented continuation lines fold into the previous item, including lines nested
    // under a sub-bullet: there is no separate "nested list" concept here by design.
    if (/^\s+\S/.test(line) && items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
      return;
    }
    if (badLine === undefined) badLine = startLine + i;
  });
  return badLine === undefined ? { items } : { items, badLine, ...(badEmpty ? { badEmpty } : {}) };
}
