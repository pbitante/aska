import type { EffectivePersona } from '../../src/model/effective';
import type { Scope } from '../../src/model/types';
import { resolvePersona } from '../../src/resolve/resolve';
import type { Registry } from '../../src/scopes/registry';
import { personaMd, unitMd } from './md';
import { registryFor } from './scopes';

export function exampleFiles(): Record<string, string> {
  return {
    'user/units/edge-cases.md': unitMd('edge-cases', { appliesWhen: 'inputs vary', questions: ['What about empty input?'] }),
    'user/units/rollback-safety.md': unitMd('rollback-safety'),
    'user/units/maintainability.md': unitMd('maintainability', { description: 'Will this be easy to change later?', threshold: 'low' }),
    'user/units/code-style.md': unitMd('code-style', { description: 'Is the code consistently formatted?' }),
    'user/units/scope-creep.md': unitMd('scope-creep'),
    'user/units/unused.md': unitMd('unused'),
    'acme/units/cost.md': unitMd('cost', { description: 'What does this cost to run?' }),
    'user/personas/base.md': personaMd(['name: base', 'description: Base.', 'units:', '  primary: [scope-creep]']),
    'project/personas/example.md': personaMd([
      'name: example',
      'description: "Weighs safety over speed: #1 rule is \\"undo\\"."',
      'extends: base',
      'units:',
      '  primary:',
      '    - edge-cases',
      '    - rollback-safety:',
      '        threshold: low',
      '        add_questions:',
      '          - Has the rollback run in staging?',
      '  secondary:',
      '    - maintainability',
      '    - acme:cost:',
      '        threshold: high',
      '  deprioritized:',
      '    - code-style:',
      '        note: Only raise style if it hides a bug.',
      '  exclude: [scope-creep]',
      'overrides:',
      '  scope-creep.excluded: child',
      '  stance: child',
      '  tie-breaking: child',
      'judgment:',
      '  sections:',
      '    - name: Suggested checks',
      '      ask: Concrete checks that would catch the findings above.',
      'capabilities:',
      '  skills:',
      '    - name: superpowers:test-driven-development',
      '      when: proposing how to verify a fix',
      '  mcp:',
      '    - name: playwright',
      '      when: checking user-facing behaviour',
      '  tools: [Bash]',
    ], '## Stance\nSkeptical of anything irreversible.\n\n## Context\nWe deploy on Fridays.\n\n## Tie-breaking\nRollback safety beats edge cases.\n'),
  };
}

export function resolveExample(files: Record<string, string> = exampleFiles(), ref = 'example') {
  const { reg, root, scopes } = registryFor(files);
  const r = resolvePersona(reg, ref);
  if (!r.effective) throw new Error(`fixture failed to resolve: ${JSON.stringify(r.diagnostics, null, 2)}`);
  return { effective: r.effective as EffectivePersona, reg: reg as Registry, root, scopes: scopes as Scope[] };
}
