export interface Target {
  id: string;
  text: string;
}

const HEADING = /^ {0,3}#{2}\s+adversarial review targets(?:\s+#+)?\s*$/i;
const SECTION_END = /^ {0,3}#{1,2}(?:\s|$)/;
// A ### to ###### heading, or a numbered list starting at 1 indented less than 2 spaces (like a
// top-level bullet), starts prose even with no blank line before it. As in CommonMark, only a list
// starting at 1 can interrupt a paragraph, so a wrapped line that merely begins with "3. " stays
// part of its target.
const PROSE_BREAK = /^(?: {0,3}#{3,6}(?:\s|$)| ?1[.)]\s+\S)/;
const BULLET = /^\s*[-*+](?:\s+(.*))?$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

interface Item {
  parts: string[];
  children: { parts: string[] }[];
}

interface FenceState {
  inFence: boolean;
  char: string;
  len: number;
}

// Returns true when `line` is part of a fenced code block (an opening/closing delimiter, or
// content between them) and should be skipped entirely, updating `state` in place.
function fenceSkip(line: string, state: FenceState): boolean {
  if (state.inFence) {
    const close = FENCE_CLOSE.exec(line);
    if (close && close[1]![0] === state.char && close[1]!.length >= state.len) state.inFence = false;
    return true;
  }
  const open = FENCE_OPEN.exec(line);
  if (open) {
    state.inFence = true;
    state.char = open[1]![0]!;
    state.len = open[1]!.length;
    return true;
  }
  return false;
}

// Leading-whitespace width in columns, expanding tabs to the next multiple of 4.
function leadingIndent(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') col += 1;
    else if (ch === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

function findSectionStart(lines: string[]): number {
  const fence: FenceState = { inFence: false, char: '', len: 0 };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fenceSkip(line, fence)) continue;
    if (HEADING.test(line)) return i;
  }
  return -1;
}

// Reads the first `## Adversarial review targets` heading (case-insensitive, 0-3 leading spaces,
// a closed ATX form with trailing #s accepted) and (a) skips fenced code blocks entirely — the
// heading search skips them too, so nothing inside a fence counts as a heading, bullet or prose,
// and a fence never ends an item. Top-level bullets (-, * or +) become targets; (b) tabs expand
// to 4 columns when measuring indent. (c) An indented bullet always attaches as a nested child of
// the last top-level item (or becomes top-level itself if there is none yet) — prose or blank
// lines in between never detach it — while a bullet nested deeper than the established child
// level continues the nearest child's text. (d) An unindented non-bullet line right after an
// item's text, with no blank line before it, is a lazy continuation of that item; once a blank
// line has intervened, such a line is ignored prose, and so is a ### heading or a numbered list
// starting at 1 even with no blank line before it. (e) A heading with 0-3 leading spaces (# or
// ##) ends the section. (f) Empty bullets and thematic breaks (***, - - -, * * *) are skipped.
export function extractTargets(markdown: string): { targets: Target[] } | { error: 'no-section' | 'no-bullets' } {
  const lines = markdown.split(/\r?\n/);
  const start = findSectionStart(lines);
  if (start < 0) return { error: 'no-section' };
  const items: Item[] = [];
  let lastTop: Item | undefined;
  let childIndent: number | undefined;
  let lastChild: { parts: string[] } | undefined;
  let current: { parts: string[] } | undefined;
  let justSawBlank = false;
  // Once an unindented non-bullet line after a blank line is ignored as prose, every further
  // line of that same paragraph is ignored too, until a blank line, a bullet, or (via
  // SECTION_END, above) a heading.
  let ignoringProse = false;
  const fence: FenceState = { inFence: false, char: '', len: 0 };
  for (const line of lines.slice(start + 1)) {
    if (fenceSkip(line, fence)) continue;
    if (SECTION_END.test(line)) break;
    if (line.trim() === '') {
      justSawBlank = true;
      ignoringProse = false;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      justSawBlank = true;
      ignoringProse = false;
      continue;
    }
    const indent = leadingIndent(line);
    const bullet = BULLET.exec(line);
    if (bullet) {
      const text = (bullet[1] ?? '').trim();
      justSawBlank = false;
      ignoringProse = false;
      if (indent < 2 || !lastTop) {
        // A top-level bullet always gets its own item, even with empty text: it may turn out
        // to have nested children, in which case it keeps its own number, with no text of its own.
        const item: Item = { parts: [text], children: [] };
        items.push(item);
        lastTop = item;
        childIndent = undefined;
        lastChild = undefined;
        current = item;
        continue;
      }
      if (text === '') continue;
      if (childIndent === undefined || indent <= childIndent) {
        childIndent ??= indent;
        const child = { parts: [text] };
        lastTop.children.push(child);
        lastChild = child;
        current = child;
      } else if (lastChild) {
        lastChild.parts.push(text);
        current = lastChild;
      } else {
        const child = { parts: [text] };
        lastTop.children.push(child);
        lastChild = child;
        current = child;
      }
      continue;
    }
    if (ignoringProse) continue;
    if (PROSE_BREAK.test(line)) {
      ignoringProse = true;
      justSawBlank = false;
      continue;
    }
    if (indent > 0 && current) {
      current.parts.push(line.trim());
      justSawBlank = false;
      continue;
    }
    if (!justSawBlank && current) {
      current.parts.push(line.trim());
    } else {
      ignoringProse = true;
    }
    justSawBlank = false;
  }
  const targets: Target[] = [];
  // Drop empty top-level bullets that never gained a child: they take no number. One that did
  // gain children keeps its own number, with no " — " prefix since it has no text of its own.
  const emitted = items.filter((item) => item.children.length > 0 || item.parts.join(' ').trim() !== '');
  emitted.forEach((item, i) => {
    const text = item.parts.join(' ').trim();
    if (item.children.length === 0) {
      targets.push({ id: `T${i + 1}`, text });
      return;
    }
    const prefix = text.replace(/:\s*$/, '').trim();
    item.children.forEach((c, k) => {
      const childText = c.parts.join(' ').trim();
      targets.push({ id: `T${i + 1}.${k + 1}`, text: prefix === '' ? childText : `${prefix} — ${childText}` });
    });
  });
  return targets.length > 0 ? { targets } : { error: 'no-bullets' };
}

export function parseTargetsFile(text: string): { targets: Target[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'the targets file is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { error: 'the targets file must be a JSON object' };
  const list = (data as { targets?: unknown }).targets;
  if (!Array.isArray(list) || list.length === 0) return { error: 'the targets file needs a non-empty "targets" list' };
  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const [i, t] of list.entries()) {
    const rawId = (t as { id?: unknown } | null)?.id;
    const rawText = (t as { text?: unknown } | null)?.text;
    const id = typeof rawId === 'string' ? rawId.trim() : rawId;
    const tx = typeof rawText === 'string' ? rawText.trim() : rawText;
    if (typeof id !== 'string' || id === '' || typeof tx !== 'string' || tx === '') {
      return { error: `targets[${i}] needs a non-empty "id" and "text"` };
    }
    if (seen.has(id)) return { error: `targets[${i}]: duplicate id "${id}"` };
    seen.add(id);
    targets.push({ id, text: tx });
  }
  return { targets };
}
