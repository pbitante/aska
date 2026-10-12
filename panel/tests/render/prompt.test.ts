import { describe, expect, it } from 'vitest';
import type { EffectivePersona } from '../../src/model/effective';
import { renderPrompt } from '../../src/render/prompt';
import { exampleFiles, resolveExample } from '../helpers/example';
import { personaMd } from '../helpers/md';

describe('renderPrompt', () => {
  const { effective } = resolveExample();
  const swap = renderPrompt(effective, 'swap');
  const panel = renderPrompt(effective, 'panel');

  it('starts with identity, stance, then extra prose', () => {
    expect(swap.startsWith(
      '# Persona: example\n\nWeighs safety over speed: #1 rule is "undo".\n\n## Stance\n\nSkeptical of anything irreversible.\n\n## Context\n\nWe deploy on Fridays.\n\n## Primary concerns',
    )).toBe(true);
  });

  it('emits sections in the fixed order', () => {
    const order = ['## Stance', '## Context', '## Primary concerns', '### 1. edge-cases', '### 2. rollback-safety', '## Secondary concerns', '## Deprioritized', '## Tie-breaking', '## Capabilities', '## Giving a judgment'];
    const positions = order.map((h) => swap.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('renders primary units in full, with additions and thresholds', () => {
    expect(swap).toContain('- Applies when: inputs vary');
    expect(swap).toContain('- What about empty input?');
    expect(swap).toContain('- Has the rollback run in staging?');
    expect(swap).toMatch(/### 2\. rollback-safety[\s\S]*- Threshold: low/);
  });

  it('condenses secondary and deprioritized units', () => {
    expect(swap).toContain('- maintainability (threshold low): Will this be easy to change later?');
    expect(swap).toContain('- acme:cost (threshold high): What does this cost to run?');
    expect(swap).toContain('- `code-style`: Resist raising concerns about: Is the code consistently formatted? unless critical. Only raise style if it hides a bug.');
  });

  it('renders capabilities as conditional text', () => {
    expect(swap).toContain("- If the skill `superpowers:test-driven-development` is available, use it when proposing how to verify a fix; if it isn't, say so rather than guessing.");
    expect(swap).toContain("- If the MCP server `playwright` is available, use it when checking user-facing behaviour; if it isn't, say so rather than guessing.");
  });

  it('never mentions excluded or unlisted units, or absolute paths', () => {
    expect(swap).not.toContain('scope-creep');
    expect(swap).not.toContain('unused');
    expect(swap).not.toMatch(/\/(tmp|home|var|private)\//);
  });

  it('describes the markdown judgment in swap mode', () => {
    expect(swap).toContain('Format it in markdown with these headings, in order: Verdict; Conditions or Missing (when the verdict needs one); Findings; Cleared; Not applicable; Suggested checks.');
    expect(swap).toContain('- Suggested checks: Concrete checks that would catch the findings above.');
    expect(swap).not.toContain('Respond with only a JSON object');
  });

  it('asks for JSON in panel mode with a valid example', () => {
    expect(panel).toContain('Respond with only a JSON object');
    const example = /```json\n([\s\S]*?)\n```/.exec(panel)![1]!;
    const parsed = JSON.parse(example) as { persona: string; sections: Record<string, string> };
    expect(parsed.persona).toBe('example');
    expect(Object.keys(parsed.sections)).toEqual(['Suggested checks']);
    expect(panel).not.toContain('Format it in markdown');
  });

  it('tells a panelist to leave sections empty when the persona defines none', () => {
    const { effective: base } = resolveExample(undefined, 'base');
    expect(renderPrompt(base, 'panel')).toContain('Leave `sections` as `{}`: this persona defines no sections.');
    expect(panel).not.toContain('Leave `sections` as `{}`');
  });

  it('omits empty optional sections', () => {
    const { effective: base } = resolveExample(undefined, 'base');
    const text = renderPrompt(base, 'swap');
    expect(text).not.toContain('## Secondary concerns');
    expect(text).not.toContain('## Deprioritized');
    expect(text).not.toContain('## Capabilities');
  });

  it('is deterministic across runs and directories', () => {
    expect(renderPrompt(resolveExample().effective, 'swap')).toBe(swap);
    expect(renderPrompt(resolveExample().effective, 'panel')).toBe(panel);
  });

  it('matches the stored snapshots', () => {
    expect(swap).toMatchSnapshot('swap');
    expect(panel).toMatchSnapshot('panel');
  });

  it('collapses whitespace runs in secondary and deprioritized one-liners spanning a newline', () => {
    const mutated: EffectivePersona = {
      ...effective,
      units: {
        ...effective.units,
        secondary: effective.units.secondary.map((u) => (u.canonical === 'maintainability'
          ? { ...u, unit: { ...u.unit, description: 'Will this be easy\nto   change  later?' } }
          : u)),
        deprioritized: effective.units.deprioritized.map((u) => (u.canonical === 'code-style'
          ? { ...u, unit: { ...u.unit, description: 'Is the code\nconsistently   formatted?' }, note: 'Only raise style\nif it   hides a bug.' }
          : u)),
      },
    };
    const text = renderPrompt(mutated, 'swap');
    expect(text).toContain('- maintainability (threshold low): Will this be easy to change later?');
    expect(text).toContain('- `code-style`: Resist raising concerns about: Is the code consistently formatted? unless critical. Only raise style if it hides a bug.');
  });

  it('uses the canonical name in the panel JSON example for a plugin persona', () => {
    const files = { ...exampleFiles(), 'acme/personas/rev.md': personaMd(['name: rev', 'description: Rev.', 'units:', '  primary: [cost]']) };
    const { effective: rev } = resolveExample(files, 'acme:rev');
    const revPanel = renderPrompt(rev, 'panel');
    const example = /```json\n([\s\S]*?)\n```/.exec(revPanel)![1]!;
    expect((JSON.parse(example) as { persona: string }).persona).toBe('acme:rev');
  });

  it('documents investigate in both modes, and in the panel JSON example', () => {
    expect(swap).toContain('`investigate`');
    expect(panel).toContain('`investigate`');
    const example = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(panel)![1]!) as { investigate: unknown[] };
    expect(example.investigate).toEqual([{ what: '...', why: '...', tools: ['...'] }]);
  });
});
