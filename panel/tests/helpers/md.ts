export interface UnitOpts {
  description?: string;
  threshold?: string;
  appliesWhen?: string;
  questions?: string[];
  redFlags?: string[];
  extraBody?: string;
}

export function unitMd(name: string, o: UnitOpts = {}): string {
  const fm = [`name: ${name}`, `description: ${o.description ?? `About ${name}`}`];
  if (o.appliesWhen) fm.push(`applies_when: ${o.appliesWhen}`);
  fm.push(`threshold: ${o.threshold ?? 'medium'}`);
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
  return [
    '---',
    ...fm,
    '---',
    '',
    '## Looks for',
    `Things about ${name}.`,
    '',
    '## Questions',
    list(o.questions ?? [`Is ${name} ok?`]),
    '',
    '## Red flags',
    list(o.redFlags ?? [`${name} is broken`]),
    '',
    '## Good looks like',
    `${name} is fine.`,
    '',
  ].join('\n') + (o.extraBody ?? '');
}

const DEFAULT_BODY = '## Stance\nCareful.\n\n## Tie-breaking\nSafety first.\n';

export function personaMd(front: string[], body: string = DEFAULT_BODY): string {
  return `---\n${front.join('\n')}\n---\n\n${body}`;
}

export function panelMd(name: string, personas: string[], o: { description?: string; notes?: string; extra?: string[] } = {}): string {
  const fm = [`name: ${name}`, `description: ${o.description ?? `Panel ${name}`}`, `personas: [${personas.join(', ')}]`, ...(o.extra ?? [])];
  return `---\n${fm.join('\n')}\n---\n\n${o.notes ?? ''}`;
}
