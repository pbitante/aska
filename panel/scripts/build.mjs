import { chmodSync, existsSync } from 'node:fs';
import { build } from 'esbuild';

const outfile = 'skills/operator/scripts/persona.mjs';

// Without a local node_modules, esbuild resolves packages from a parent folder (a worktree's main
// checkout) and writes that relative path into the committed bundle.
if (!existsSync('node_modules/yaml')) {
  console.error('build: node_modules/yaml is missing here; run npm ci in this checkout first');
  process.exit(1);
}

await build({
  entryPoints: ['src/cli/bin.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  banner: { js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);' },
  legalComments: 'none',
});
chmodSync(outfile, 0o755);
console.log(`built ${outfile}`);
