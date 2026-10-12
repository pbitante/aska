// Builds a throwaway git repo for the hand-run gate eval (see README.md here): a step file with
// three review targets on `main`, and two branches that differ only in count.mjs. `planted`
// hangs on empty input, which breaks T1 and T2; `clean` doesn't.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'gate-eval-fixture-'));
const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
const write = (path, text) => writeFileSync(join(dir, path), text);

git('init', '-q', '-b', 'main');
git('config', 'user.email', 'gate-eval@example.invalid');
git('config', 'user.name', 'gate eval');
mkdirSync(join(dir, 'steps'));
write('steps/step-1-count.md', `# Step 1: count lines

**Goal:** \`count.mjs\` reads stdin and prints how many lines it has.

## Acceptance criteria

1. **AC1.1** \`printf 'a\\nb\\n' | node count.mjs\` prints \`2\`.

## Adversarial review targets

- Empty input: \`printf '' | node count.mjs\` prints \`0\` and exits 0.
- A closed stdin doesn't hang: \`node count.mjs < /dev/null\` finishes within 2 seconds.
- Bytes that aren't UTF-8 don't crash it: \`printf '\\xff\\n' | node count.mjs\` prints \`1\`.

## Implementation check

\`\`\`bash
printf 'a\\nb\\n' | node count.mjs
\`\`\`
`);
git('add', '.');
git('commit', '-q', '-m', 'docs: step 1 spec');

const head = `let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { data += c; });
process.stdin.on('end', () => {
`;
const count = `  const lines = data === '' ? 0 : data.split('\\n').filter((l, i, a) => i < a.length - 1 || l !== '').length;
  console.log(lines);
});
`;
const variants = {
  clean: head + count,
  planted: `${head}  if (data === '') { setInterval(() => {}, 60_000); return; }\n${count}`,
};
for (const [branch, source] of Object.entries(variants)) {
  git('checkout', '-q', '-b', branch, 'main');
  write('count.mjs', source);
  git('add', 'count.mjs');
  git('commit', '-q', '-m', 'feat: count lines on stdin');
}
git('checkout', '-q', 'main');
console.log(dir);
