import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/diagnostics';
import { parsePersona } from '../../src/parse/persona';
import { parseUnit } from '../../src/parse/unit';
import { personaMd, unitMd } from '../helpers/md';

function assertEveryDiagnosticHasLocAndFix(label: string, diagnostics: Diagnostic[]): void {
  expect(diagnostics.length, `${label}: expected at least one diagnostic`).toBeGreaterThan(0);
  for (const d of diagnostics) {
    expect(d.loc, `${label}: ${d.code} is missing loc`).toBeDefined();
    expect(typeof d.fix === 'string' && d.fix.trim().length > 0, `${label}: ${d.code} has no non-empty fix`).toBe(true);
  }
}

describe('every diagnostic has a loc and a non-empty fix', () => {
  const unitCases: Record<string, string> = {
    'missing required fields': '---\nname: x\n---\n\n## Looks for\na\n\n## Questions\n- q\n\n## Red flags\n- r\n\n## Good looks like\ng\n',
    'wrongly typed name and threshold': unitMd('x').replace('name: x', 'name: 123').replace('threshold: medium', 'threshold: [low]'),
    'unknown threshold value': unitMd('x', { threshold: 'severe' }),
    'unknown frontmatter field': unitMd('x').replace('threshold: medium', 'threshold: medium\nseverity: high'),
    'unknown heading with suggestion': unitMd('x', { extraBody: '\n## Red flag\n- typo\n' }),
    'duplicate heading': unitMd('x', { extraBody: '\n## Questions\n- again\n' }),
    'preamble text': unitMd('x').replace('---\n\n## Looks for', '---\nintro\n## Looks for'),
    'missing heading': unitMd('x').replace('## Good looks like\nx is fine.\n', ''),
    'empty prose section': unitMd('x').replace('## Looks for\nThings about x.\n', '## Looks for\n'),
    'empty list section': unitMd('x').replace('## Questions\n- Is x ok?\n', '## Questions\n'),
    'non-bullet text in a list': unitMd('x').replace('- Is x ok?', '- Is x ok?\nnot a bullet'),
    'bare bullet marker': unitMd('x').replace('- Is x ok?', '- Is x ok?\n-'),
    'unclosed fence': unitMd('x', { extraBody: '\n```\nmore\n' }),
    'empty description': unitMd('x', { description: "''" }),
  };

  for (const [label, src] of Object.entries(unitCases)) {
    it(`unit: ${label}`, () => {
      const r = parseUnit('/s/units/x.md', src);
      assertEveryDiagnosticHasLocAndFix(label, r.diagnostics);
    });
  }

  const personaCases: Record<string, { front: string[]; body?: string }> = {
    'unknown setting and setting not allowed in the tier': {
      front: ['name: x', 'description: d', 'units:', '  primary:', '    - a:', '        weight: 2', '  secondary:', '    - b:', '        add_questions: [q]'],
    },
    'setting not allowed in deprioritized': {
      front: ['name: x', 'description: d', 'units:', '  primary: [a]', '  deprioritized:', '    - c:', '        threshold: low'],
    },
    'unknown key under units': { front: ['name: x', 'description: d', 'units:', '  primary: [a]', '  tertiary: [b]'] },
    'duplicate unit across tiers': { front: ['name: x', 'description: d', 'units:', '  primary: [a]', '  secondary: [a]'] },
    'duplicate unit in the same tier': { front: ['name: x', 'description: d', 'units:', '  primary: [a, a]'] },
    'needs extends for exclude, primary_order and overrides': {
      front: ['name: x', 'description: d', 'units:', '  primary: [a]', '  exclude: [b]', '  primary_order: [a]', 'overrides:', '  stance: parent'],
    },
    'override value other than child or parent': { front: ['name: x', 'extends: base', 'overrides:', '  stance: mine'], body: '' },
    'judgment section collides with core heading and duplicate': {
      front: ['name: x', 'extends: base', 'judgment:', '  sections:', '    - name: Findings', '      ask: a', '    - name: Extra', '      ask: a', '    - name: extra', '      ask: b'],
      body: '',
    },
    'unknown key on judgment itself': { front: ['name: x', 'extends: base', 'judgment:', '  foo: bar'], body: '' },
    'unknown key on a judgment section entry': {
      front: ['name: x', 'extends: base', 'judgment:', '  sections:', '    - name: Suggested checks', '      ask: a', '      required: true'],
      body: '',
    },
    'unknown top-level key on capabilities': { front: ['name: x', 'extends: base', 'capabilities:', '  hooks: []'], body: '' },
    'unknown key on a capability, including the removed required field': {
      front: ['name: x', 'extends: base', 'capabilities:', '  mcp:', '    - name: playwright', '      when: UI', '      required: true'],
      body: '',
    },
    'duplicate capability': {
      front: ['name: x', 'extends: base', 'capabilities:', '  mcp:', '    - name: playwright', '      when: a', '    - name: " playwright "', '      when: b'],
      body: '',
    },
    'root persona missing description, primary unit, Stance and Tie-breaking': { front: ['name: x'], body: '## Notes\nhi\n' },
    'invalid extends cascading into root-required and needs-extends': {
      front: ['name: x', 'extends: 5', 'units:', '  exclude: [a]'],
      body: '',
    },
    'units.primary with a type error': { front: ['name: x', 'description: d', 'units:', '  primary: a'] },
    'description with a type error': { front: ['name: x', 'description: 5', 'units:', '  primary: [a]'] },
    'near-miss section heading': { front: ['name: x', 'description: d', 'units:', '  primary: [a]'], body: '## Tie breaking\nx\n' },
    'unclosed fence in the body': { front: ['name: x', 'extends: base'], body: '## Stance\n```\n## Tie-breaking\nx\n' },
    'preamble text and duplicate body headings': { front: ['name: x', 'extends: base'], body: 'intro\n## Stance\na\n\n## stance\nb\n' },
    'invalid unit entry shapes and primary_order duplicates': {
      front: [
        'name: x',
        'description: d',
        'units:',
        '  primary:',
        '    - not valid ref',
        '    - a: b',
        '    - c:',
        '        ref: 1',
        '  primary_order: [not valid ref, not valid ref]',
      ],
    },
  };

  for (const [label, { front, body }] of Object.entries(personaCases)) {
    it(`persona: ${label}`, () => {
      const r = parsePersona('/s/personas/x.md', personaMd(front, body));
      assertEveryDiagnosticHasLocAndFix(label, r.diagnostics);
    });
  }
});
