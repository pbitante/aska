// The shape agents/investigator.md asks for. Checking it can't tell a fact from an opinion; it
// catches the replies that are plainly unusable: prose, a preamble, a missing or empty section, or
// a section of the investigator's own such as a verdict.
export const EVIDENCE_SECTIONS = ['Checked', 'Ran', 'Found', 'Not determined'] as const;

const HEADING = /^##(?!#)\s+(.*?)\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
// A closing fence has no info string, so ```bash inside an open block doesn't close it.
const CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const list = EVIDENCE_SECTIONS.map((s) => `"## ${s}"`).join(', ');

export function validateEvidence(text: string): string[] {
  if (text.trim() === '') return ['no input'];
  const sections: { name: string; body: string[] }[] = [];
  let preamble = false;
  let fence: string | undefined;
  let fenceLine = 0;
  for (const [i, line] of text.split('\n').entries()) {
    const f = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      const c = CLOSE.exec(line)?.[1];
      if (c !== undefined && c[0] === fence[0] && c.length >= fence.length) fence = undefined;
    } else if (f !== undefined) {
      fence = f;
      fenceLine = i + 1;
    } else {
      const h = HEADING.exec(line);
      if (h) {
        sections.push({ name: h[1]!, body: [] });
        continue;
      }
    }
    if (sections.length === 0) preamble ||= line.trim() !== '';
    else sections[sections.length - 1]!.body.push(line);
  }

  const v: string[] = [];
  if (preamble) v.push('text before "## Checked"; reply with only the four sections');
  // Everything after an unclosed fence reads as code, so the section checks would only mislead.
  if (fence !== undefined) return [...v, `a code fence opened on line ${fenceLine} is never closed; close it so the sections after it can be read`];
  const known = (EVIDENCE_SECTIONS as readonly string[]);
  for (const s of sections) if (!known.includes(s.name)) v.push(`unexpected section "## ${s.name}"`);
  for (const name of EVIDENCE_SECTIONS) {
    const found = sections.filter((s) => s.name === name);
    if (found.length === 0) v.push(`missing section "## ${name}"`);
    else if (found.length > 1) v.push(`section "## ${name}" appears more than once`);
    else if (found[0]!.body.every((l) => l.trim() === '')) v.push(`section "## ${name}" is empty; write "Nothing" if there is nothing to say`);
  }
  const order = EVIDENCE_SECTIONS.map((name) => sections.findIndex((s) => s.name === name)).filter((i) => i >= 0);
  if (order.some((i, k) => k > 0 && i < order[k - 1]!)) v.push(`sections out of order: expected ${list}`);
  return v;
}
