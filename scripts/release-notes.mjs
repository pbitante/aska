#!/usr/bin/env node
// Prints one version's section of a plugin's CHANGELOG.md, for
// `gh release create <tag> --notes-file <(node scripts/release-notes.mjs <plugin> <version>)`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANGELOGS = { aska: 'panel/CHANGELOG.md', 'aska-editor': 'paseo-plugin/CHANGELOG.md' };

const [plugin, version] = process.argv.slice(2);
if (!CHANGELOGS[plugin] || !version) {
  console.error(`usage: release-notes.mjs <${Object.keys(CHANGELOGS).join('|')}> <version>`);
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = readFileSync(join(root, CHANGELOGS[plugin]), 'utf8').split('\n');
const start = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
if (start < 0) {
  console.error(`no "## ${version}" section in ${CHANGELOGS[plugin]}`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
// GitHub renders a release body's single newlines as line breaks, so join the changelog's wrapped
// lines back into one line per paragraph or list item. Code blocks are left as they are.
const out = [];
let fenced = false;
for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
  const text = line.trim();
  if (text.startsWith('```')) fenced = !fenced;
  const prev = out.length - 1;
  const continues = !fenced && !text.startsWith('```') && text !== '' && prev >= 0 && out[prev].trim() !== ''
    && !out[prev].trim().startsWith('```') && !/^([-*+]|\d+[.)]|#+|>)\s/.test(text);
  if (continues) out[prev] += ` ${text}`;
  else out.push(line);
}
process.stdout.write(out.join('\n').trim() + '\n');
