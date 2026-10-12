import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inputEquivalent, sourceCost, sourceFiles, tokensByModel } from '../../evals/cost/tokens';

const assistant = (id: string, model: string, usage: Record<string, unknown>) =>
  JSON.stringify({ type: 'assistant', message: { id, model, usage } });

describe('tokensByModel', () => {
  it('counts each message once, keeping the largest count a repeated message id reports', () => {
    const lines = [
      assistant('m1', 'opus', { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 17 }),
      assistant('m1', 'opus', { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 169 }),
      assistant('m2', 'opus', { input_tokens: 3, cache_creation_input_tokens: 50, cache_read_input_tokens: 100, output_tokens: 10 }),
    ];
    expect(tokensByModel(lines).get('opus')).toEqual({ input: 5, cacheWrite5m: 150, cacheWrite1h: 0, cacheRead: 100, output: 179 });
  });

  it('splits cache writes by lifetime when the usage says so, and keeps models apart', () => {
    const lines = [
      assistant('a', 'opus', { input_tokens: 1, cache_creation_input_tokens: 30, cache_read_input_tokens: 0, output_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } }),
      assistant('b', 'haiku', { input_tokens: 4, output_tokens: 2 }),
    ];
    const t = tokensByModel(lines);
    expect(t.get('opus')).toEqual({ input: 1, cacheWrite5m: 10, cacheWrite1h: 20, cacheRead: 0, output: 1 });
    expect(t.get('haiku')).toEqual({ input: 4, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 2 });
  });

  it('skips lines that are not JSON, not assistant messages, or carry no usage or id', () => {
    const lines = ['// stderr', '', '{"type":"user"}', JSON.stringify({ type: 'assistant', message: { model: 'x', usage: { input_tokens: 9 } } }), assistant('c', 'x', { input_tokens: 1 })];
    expect([...tokensByModel(lines).entries()]).toEqual([['x', { input: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }]]);
  });
});

describe('inputEquivalent', () => {
  it('weighs 5-minute cache writes 1.25x, 1-hour writes 2x, reads 0.1x and output 5x the input price', () => {
    expect(inputEquivalent({ input: 10, cacheWrite5m: 100, cacheWrite1h: 100, cacheRead: 1000, output: 10 })).toBe(10 + 125 + 200 + 100 + 50);
  });
});

describe('sourceCost', () => {
  it('totals every model, and takes the dollar cost from a stream-json result event when there is one', () => {
    const lines = [
      assistant('a', 'opus', { input_tokens: 10, output_tokens: 2 }),
      assistant('b', 'haiku', { input_tokens: 5 }),
      JSON.stringify({ type: 'result', total_cost_usd: 0.25 }),
    ];
    const c = sourceCost(lines);
    expect(c.inputEquivalent).toBe(20 + 5);
    expect(c.usd).toBe(0.25);
    expect(Object.keys(c.byModel)).toEqual(['opus', 'haiku']);
    expect(c.byModel.opus!.inputEquivalent).toBe(20);
    expect(sourceCost([assistant('a', 'opus', { input_tokens: 1 })]).usd).toBeNull();
  });
});

describe('sourceCost from stream-json', () => {
  it('prefers the result event\'s per-model totals, which count output the streamed messages leave out', () => {
    const lines = [
      assistant('a', 'sonnet', { input_tokens: 1, cache_read_input_tokens: 50, output_tokens: 1 }),
      JSON.stringify({
        type: 'result', total_cost_usd: 0.5,
        usage: { cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 30 } },
        modelUsage: { sonnet: { inputTokens: 4, outputTokens: 200, cacheReadInputTokens: 1000, cacheCreationInputTokens: 80 } },
      }),
    ];
    expect(sourceCost(lines).byModel).toEqual({ sonnet: { input: 4, cacheWrite5m: 20, cacheWrite1h: 60, cacheRead: 1000, output: 200, inputEquivalent: 4 + 25 + 120 + 100 + 1000 } });
  });

  it('leaves out a model with no tokens at all', () => {
    expect(Object.keys(sourceCost([assistant('a', '<synthetic>', { input_tokens: 0, output_tokens: 0 }), assistant('b', 'opus', { input_tokens: 1 })]).byModel)).toEqual(['opus']);
  });
});

describe('sourceFiles', () => {
  it('reads a session transcript together with its sub-agents\' transcripts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cost-'));
    writeFileSync(join(dir, 's1.jsonl'), '');
    mkdirSync(join(dir, 's1', 'subagents'), { recursive: true });
    for (const f of ['agent-b.jsonl', 'agent-a.jsonl', 'agent-a.meta.json']) writeFileSync(join(dir, 's1', 'subagents', f), '');
    expect(sourceFiles(join(dir, 's1.jsonl'))).toEqual([join(dir, 's1.jsonl'), join(dir, 's1', 'subagents', 'agent-a.jsonl'), join(dir, 's1', 'subagents', 'agent-b.jsonl')]);
    writeFileSync(join(dir, 'eval.jsonl'), '');
    expect(sourceFiles(join(dir, 'eval.jsonl'))).toEqual([join(dir, 'eval.jsonl')]);
  });
});
