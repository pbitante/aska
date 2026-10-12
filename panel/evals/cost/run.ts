import { existsSync, readFileSync } from 'node:fs';
import { sourceCost, sourceFiles, type SourceCost } from './tokens';

// npx tsx evals/cost/run.ts <label>=<transcript.jsonl> [<label>=<transcript.jsonl> …] [--json]
const args = process.argv.slice(2);
const json = args.includes('--json');
const specs = args.filter((a) => a !== '--json');
if (specs.length === 0 || specs.some((s) => !/^[^=]+=.+/.test(s))) {
  console.error('usage: npx tsx evals/cost/run.ts <label>=<transcript.jsonl> [<label>=<transcript.jsonl> …] [--json]');
  process.exit(1);
}

const rows: { label: string; files: string[]; cost: SourceCost }[] = [];
for (const spec of specs) {
  const i = spec.indexOf('=');
  const label = spec.slice(0, i);
  const path = spec.slice(i + 1);
  if (!existsSync(path)) {
    console.error(`no such transcript for ${label}: ${path}`);
    process.exit(1);
  }
  const files = sourceFiles(path);
  const lines = files.flatMap((f) => readFileSync(f, 'utf8').split('\n'));
  rows.push({ label, files, cost: sourceCost(lines) });
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const base = rows[0]!.cost.inputEquivalent;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  for (const r of rows) {
    const ratio = base > 0 ? ` (${(r.cost.inputEquivalent / base).toFixed(2)}× ${rows[0]!.label})` : '';
    const usd = r.cost.usd === null ? '' : `, $${r.cost.usd.toFixed(2)}`;
    console.log(`${r.label}: ${k(r.cost.inputEquivalent)} input-equivalent${ratio}${usd}, ${r.files.length} transcript${r.files.length === 1 ? '' : 's'}`);
    for (const [model, t] of Object.entries(r.cost.byModel)) {
      console.log(`  ${model}: input ${k(t.input)}, cache write ${k(t.cacheWrite5m + t.cacheWrite1h)}, cache read ${k(t.cacheRead)}, output ${k(t.output)} → ${k(t.inputEquivalent)}`);
    }
  }
}
