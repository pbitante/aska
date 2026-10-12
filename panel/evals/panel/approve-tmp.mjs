#!/usr/bin/env node
// Minimal stdio MCP server for `claude -p --permission-prompt-tool`, used by the panel eval. It
// approves Write only under the temporary folder the panel skill itself creates with
// `mktemp -d -t aska-panel-XXXXXX` (a plain OS temp dir, named with the `aska-panel-` prefix, that
// sits outside the eval's temporary project), and denies every other permission prompt — including
// writes into the temporary project, which the eval's snapshot diff separately proves untouched.
import { lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, sep } from 'node:path';
import { createInterface } from 'node:readline';

function realOrSelf(p) {
  try {
    // realpathSync.native (the real realpath(3) syscall) is required here, not the default
    // realpathSync (a pure-JS reimplementation): the JS version collapses a trailing ".."
    // lexically before resolving symlinks, so it would miss exactly the escape this is meant to
    // catch — a symlinked directory component followed by "..".
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

const tmpRoot = realOrSelf(tmpdir());

function underAskaPanelTmp(dirReal) {
  if (!dirReal.startsWith(tmpRoot + sep)) return false;
  const top = dirReal.slice(tmpRoot.length + 1).split(sep)[0] ?? '';
  return top.startsWith('aska-panel-');
}

function deny() {
  return { behavior: 'deny', message: `eval harness only approves writes under an aska-panel-* folder in ${tmpRoot}` };
}

function decide(args) {
  const path = args?.input?.file_path;
  if (args?.tool_name !== 'Write' || typeof path !== 'string') return deny();
  // Raw concatenation, not path.resolve(): resolve() would lexically fold away a trailing ".."
  // before realpath ever gets to follow a symlinked directory component, hiding exactly the
  // escape realOrSelf(dirname(...)) is meant to catch (see the same check in approve-personas.mjs).
  const absRaw = isAbsolute(path) ? path : process.cwd() + sep + path;
  if (!underAskaPanelTmp(realOrSelf(dirname(absRaw)))) return deny();
  try {
    if (lstatSync(absRaw).isSymbolicLink()) return deny();
  } catch {
    // doesn't exist yet: a normal first write
  }
  return { behavior: 'allow', updatedInput: args.input };
}

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
createInterface({ input: process.stdin }).on('line', (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  if (req.id === undefined) return;
  if (req.method === 'initialize') {
    send({ id: req.id, result: { protocolVersion: req.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'approve-panel-tmp', version: '1' } } });
  } else if (req.method === 'tools/list') {
    send({ id: req.id, result: { tools: [{ name: 'approve', description: 'Permission prompt handler for the panel eval', inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' } }, required: ['tool_name', 'input'] } }] } });
  } else if (req.method === 'tools/call') {
    send({ id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(decide(req.params?.arguments)) }] } });
  } else {
    send({ id: req.id, error: { code: -32601, message: `unknown method ${req.method}` } });
  }
});
