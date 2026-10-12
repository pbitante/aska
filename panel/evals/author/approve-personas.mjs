#!/usr/bin/env node
// Minimal stdio MCP server for `claude -p --permission-prompt-tool`. It approves only Write/Edit of
// `<cwd>/.claude/personas/<name>.persona.md|.unit.md` and denies every other permission prompt.
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

const allowedDir = resolve(process.cwd(), '.claude', 'personas') + sep;
const allowedDirNoSep = allowedDir.slice(0, -1);

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

function deny() {
  return { behavior: 'deny', message: `eval harness only approves writes to ${allowedDir}<name>.persona.md or .unit.md` };
}

function decide(args) {
  const path = args?.input?.file_path;
  if ((args?.tool_name === 'Write' || args?.tool_name === 'Edit') && typeof path === 'string') {
    const abs = resolve(process.cwd(), path);
    if (abs.startsWith(allowedDir) && !abs.slice(allowedDir.length).includes(sep) && /\.(persona|unit)\.md$/.test(abs)) {
      // The lexical checks above can be true while the path actually escapes the folder, e.g. a
      // symlinked directory component that a `..` segment lexically folds away. Resolve the
      // parent through the filesystem (following real symlinks) and require it to be the real
      // `.claude/personas`, not just the lexically-resolved one.
      const absRaw = isAbsolute(path) ? path : process.cwd() + sep + path;
      if (realOrSelf(dirname(absRaw)) !== realOrSelf(allowedDirNoSep)) return deny();
      // The target itself can also be a symlink pointing outside the folder.
      try {
        if (lstatSync(abs).isSymbolicLink()) return deny();
      } catch {
        // doesn't exist yet: a normal first write
      }
      return { behavior: 'allow', updatedInput: args.input };
    }
  }
  return deny();
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
    send({ id: req.id, result: { protocolVersion: req.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'approve-personas', version: '1' } } });
  } else if (req.method === 'tools/list') {
    send({ id: req.id, result: { tools: [{ name: 'approve', description: 'Permission prompt handler for the author eval', inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' } }, required: ['tool_name', 'input'] } }] } });
  } else if (req.method === 'tools/call') {
    send({ id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(decide(req.params?.arguments)) }] } });
  } else {
    send({ id: req.id, error: { code: -32601, message: `unknown method ${req.method}` } });
  }
});
