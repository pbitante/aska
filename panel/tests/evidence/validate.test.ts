import { describe, expect, it } from 'vitest';
import { EVIDENCE_SECTIONS, validateEvidence } from '../../src/evidence/validate';

const evidence = (parts: Partial<Record<string, string>> = {}) =>
  EVIDENCE_SECTIONS.map((s) => `## ${s}\n${parts[s] ?? `Some ${s.toLowerCase()} text.`}\n`).join('\n');

describe('validateEvidence', () => {
  it('accepts the four sections in order, each with content', () => {
    expect(validateEvidence(evidence())).toEqual([]);
  });

  it('accepts "Nothing" as a section\'s content, and subheadings inside a section', () => {
    expect(validateEvidence(evidence({ Found: 'Nothing', 'Not determined': '### Versions\nOnly 2.1.282 was checked.' }))).toEqual([]);
  });

  it('ignores heading-like lines inside fenced code, such as quoted output', () => {
    const ran = '- `cat notes.md`:\n```\n## Found\n## Checked\n```\n~~~\n## Extra\n~~~';
    expect(validateEvidence(evidence({ Ran: ran }))).toEqual([]);
  });

  it('does not close a fence on a line that names a language', () => {
    const ran = '```\n```bash\n## Found\n```';
    expect(validateEvidence(evidence({ Ran: ran }))).toEqual([]);
  });

  it('reports a fence that is never closed, instead of sections it hid', () => {
    expect(validateEvidence(evidence({ Ran: '```\nnpm test' }))).toEqual([
      'a code fence opened on line 5 is never closed; close it so the sections after it can be read',
    ]);
  });

  it('reports empty input', () => {
    expect(validateEvidence('  \n')).toEqual(['no input']);
  });

  it('reports a missing section', () => {
    const text = evidence().replace(/## Found\n[^\n]*\n/, '');
    expect(validateEvidence(text)).toEqual(['missing section "## Found"']);
  });

  it('reports a section with no content', () => {
    expect(validateEvidence(evidence({ Ran: '   ' }))).toEqual(['section "## Ran" is empty; write "Nothing" if there is nothing to say']);
  });

  it('reports sections out of order', () => {
    const [checked, ran, found, notDetermined] = evidence().split('\n\n');
    expect(validateEvidence([checked, found, ran, notDetermined].join('\n\n'))).toEqual([
      'sections out of order: expected "## Checked", "## Ran", "## Found", "## Not determined"',
    ]);
  });

  it('reports a repeated section', () => {
    expect(validateEvidence(`${evidence()}\n## Found\nMore.\n`)).toEqual(['section "## Found" appears more than once']);
  });

  it('reports an unexpected section, such as a verdict', () => {
    expect(validateEvidence(`${evidence()}\n## Verdict\nSafe to merge.\n`)).toEqual(['unexpected section "## Verdict"']);
  });

  it('reports text before the first section, such as a preamble or a code fence', () => {
    expect(validateEvidence(`Here is what I found.\n\n${evidence()}`)).toEqual(['text before "## Checked"; reply with only the four sections']);
    expect(validateEvidence(`\`\`\`markdown\n${evidence()}\`\`\`\n`)[0]).toBe('text before "## Checked"; reply with only the four sections');
  });

  it('reports prose with no sections at all as each missing section', () => {
    expect(validateEvidence('It looks fine to me.')).toEqual([
      'text before "## Checked"; reply with only the four sections',
      ...EVIDENCE_SECTIONS.map((s) => `missing section "## ${s}"`),
    ]);
  });
});
