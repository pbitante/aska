import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../src/parse/frontmatter';
import { renderPrompt } from '../../src/render/prompt';
import { MARKER, generatedFileName, generatedName, inputHash, outputStyleFile, panelTools, readMarker, subagentFile } from '../../src/render/targets';
import { exampleFiles, resolveExample } from '../helpers/example';
import { personaMd } from '../helpers/md';

describe('generated files', () => {
  const { effective } = resolveExample();

  it('names generated files and agents, encoding plugin namespaces', () => {
    expect(generatedName(effective)).toBe('example-persona');
    expect(generatedFileName(effective)).toBe('example.persona.md');
    const files = { ...exampleFiles(), 'acme/personas/rev.md': personaMd(['name: rev', 'description: Rev.', 'units:', '  primary: [cost]']) };
    const rev = resolveExample(files, 'acme:rev').effective;
    expect(generatedName(rev)).toBe('acme--rev-persona');
    expect(generatedFileName(rev)).toBe('acme--rev.persona.md');
  });

  it('builds the panel tool list from capabilities', () => {
    expect(panelTools(effective)).toEqual(['Read', 'Grep', 'Glob', 'Skill', 'mcp__playwright', 'Bash']);
    expect(panelTools(resolveExample(undefined, 'base').effective)).toEqual(['Read', 'Grep', 'Glob']);
  });

  it('writes a valid output style with marker and keep-coding-instructions', () => {
    const text = outputStyleFile(effective, 'sha256:abc');
    const lines = text.split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]!.startsWith(MARKER)).toBe(true);
    const fm = splitFrontmatter('s.md', text).fm!;
    expect(fm.data).toEqual({
      name: 'example-persona',
      description: 'Weighs safety over speed: #1 rule is "undo".',
      'keep-coding-instructions': true,
    });
    expect(fm.body.trimStart()).toBe(renderPrompt(effective, 'swap'));
    expect(readMarker(text)).toEqual({ source: 'project/example.persona.md', persona: 'example', hash: 'sha256:abc' });
  });

  it('writes a valid subagent with an explicit tools list', () => {
    const text = subagentFile(effective, 'sha256:abc');
    const fm = splitFrontmatter('a.md', text).fm!;
    expect(fm.data.name).toBe('example-persona');
    expect(fm.data.tools).toBe('Read, Grep, Glob, Skill, mcp__playwright, Bash');
    expect(fm.body.trimStart()).toBe(renderPrompt(effective, 'panel'));
  });

  it('does not recognise a hand-written file as generated', () => {
    expect(readMarker('---\nname: x\n---\nhello\n')).toBeUndefined();
  });

  it('hashes input contents', () => {
    const { effective: e, root } = resolveExample();
    const h1 = inputHash(e);
    expect(inputHash(e)).toBe(h1);
    expect(h1).toMatch(/^sha256:[0-9a-f]{64}$/);
    const unused = join(root, 'home/.claude/personas/unused.unit.md');
    writeFileSync(unused, `${readFileSync(unused, 'utf8')}\n`);
    expect(inputHash(e)).toBe(h1);
    const persona = join(root, 'proj/.claude/personas/example.persona.md');
    writeFileSync(persona, readFileSync(persona, 'utf8').replace('Skeptical', 'Wary'));
    expect(inputHash(e)).not.toBe(h1);
  });

  it('hashes to a pinned digest, independent of locale-sensitive id ordering', () => {
    // "aa" sorts before "b" by UTF-16 code unit (the only locale-independent order), but under
    // a da_DK/nb_NO/cs_CZ collation .localeCompare() treats "aa" as "å" and sorts it after "b".
    // Ids are listed out of code-unit order here to prove inputHash sorts them itself. This
    // digest was computed once from this exact (version, ids, content) tuple and is pinned so a
    // reintroduced .localeCompare (or any other change to the hashed bytes) changes it.
    const content: Record<string, string> = { '/fixed/b.md': 'B\n', '/fixed/aa.md': 'AA\n' };
    const p = { ...effective, inputs: ['/fixed/b.md', '/fixed/aa.md'], inputIds: ['user/b.unit.md', 'user/aa.unit.md'] };
    expect(inputHash(p, (f) => content[f]!)).toBe('sha256:f460f72e3ec388a8adc8436299f91bc0ec790a9624f5a68d1402f13c14727bf4');
  });

  it('is the same for the same content in two different directories', () => {
    const a = resolveExample();
    const b = resolveExample();
    expect(a.root).not.toBe(b.root);
    expect(inputHash(a.effective)).toBe(inputHash(b.effective));
    expect(outputStyleFile(a.effective, inputHash(a.effective))).toBe(outputStyleFile(b.effective, inputHash(b.effective)));
    expect(subagentFile(a.effective, inputHash(a.effective))).toBe(subagentFile(b.effective, inputHash(b.effective)));
  });

  it('writes a scope-relative, not absolute, source id', () => {
    const text = outputStyleFile(effective, 'sha256:abc');
    const lines = text.split('\n');
    expect(lines[2]).toBe('# source: project/example.persona.md');
    expect(lines[3]).toBe('# persona: example');
    expect(lines[4]).toBe('# hash: sha256:abc');
    expect(text).not.toMatch(/\/(tmp|home|var|private)\//);
  });

  it('round-trips source, persona and hash through readMarker, for both generated files', () => {
    const style = outputStyleFile(effective, 'sha256:abc');
    const agent = subagentFile(effective, 'sha256:abc');
    const expected = { source: 'project/example.persona.md', persona: 'example', hash: 'sha256:abc' };
    expect(readMarker(style)).toEqual(expected);
    expect(readMarker(agent)).toEqual(expected);
  });

  it('strips a leading BOM before reading the marker', () => {
    const text = outputStyleFile(effective, 'sha256:abc');
    expect(readMarker(`﻿${text}`)).toEqual({ source: 'project/example.persona.md', persona: 'example', hash: 'sha256:abc' });
  });

  it('keeps a newline in the description as valid YAML frontmatter', () => {
    const p = { ...effective, description: 'Line one\nLine two' };
    const text = outputStyleFile(p, 'sha256:abc');
    const fm = splitFrontmatter('s.md', text).fm!;
    expect(fm.data.description).toBe('Line one\nLine two');
  });
});
