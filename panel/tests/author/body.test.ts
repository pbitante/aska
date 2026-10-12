import { describe, expect, it } from 'vitest';
import { replaceSection } from '../../src/author/body';

const BODY = '\n## Stance\nCareful.\n\n## Tie-breaking\nSafety first.\n';

describe('replaceSection', () => {
  it('replaces one section and keeps the others', () => {
    expect(replaceSection(BODY, 'Stance', 'Bold.\nVery bold.')).toBe('\n## Stance\n\nBold.\nVery bold.\n\n## Tie-breaking\nSafety first.\n');
  });

  it('matches headings case- and space-insensitively, and replaces the last section', () => {
    expect(replaceSection(BODY, 'tie-breaking', 'Speed.')).toBe('\n## Stance\nCareful.\n\n## Tie-breaking\n\nSpeed.\n');
  });

  it('appends a missing section', () => {
    expect(replaceSection('\n## Stance\nCareful.\n', 'Tie-breaking', 'X.')).toBe('\n## Stance\nCareful.\n\n## Tie-breaking\n\nX.\n');
  });

  it('replaces the preamble for heading ""', () => {
    expect(replaceSection('\nOld notes.\n', '', 'New notes.')).toBe('\nNew notes.\n');
    expect(replaceSection('', '', 'Notes.')).toBe('\nNotes.\n');
  });

  it('ignores ## lines inside fenced code', () => {
    const body = '\n## Looks for\n```\n## not a heading\n```\n\n## Questions\n- q\n';
    expect(replaceSection(body, 'Questions', '- r')).toBe('\n## Looks for\n```\n## not a heading\n```\n\n## Questions\n\n- r\n');
  });
});
