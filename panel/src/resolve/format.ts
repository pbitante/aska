import { stringify } from 'yaml';

export function quoteKey(id: string): string {
  return stringify(id, { lineWidth: 0 }).trim();
}

export function overrideLine(id: string, value: 'child' | 'parent'): string {
  const key = quoteKey(id);
  return key.startsWith('"') ? `${key}: ${value}` : `"${key}: ${value}"`;
}
