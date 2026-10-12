import type { RpcInput } from "@getpaseo/plugin";
import type { z } from "zod";
import type { catalogListRpc, fileDeleteRpc, filePatchRpc, fileSaveRpc, fileShowRpc } from "../shared/rpc";
import { deleteSchema, listingSchema, showSchema, writeSchema, type AskaStatus } from "../shared/schemas";
import { unexpected, type CallOptions } from "./aska";
import type { WorkspaceLookup } from "./cwd";

export interface HandlerDeps {
  status: () => Promise<AskaStatus>;
  invalidate: () => void;
  exists: (path: string) => boolean;
  cwd: (workspaceId: string | undefined, paseo: WorkspaceLookup) => Promise<string>;
  call: (opts: CallOptions) => Promise<unknown>;
}
export interface HandlerContext {
  paseo: WorkspaceLookup;
}

function parseOutput<S extends z.ZodType>(schema: S, value: unknown, command: string): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  throw unexpected(`aska's ${command} output didn't match what the editor expects`, r.error.message.slice(0, 1000));
}

export function createHandlers(deps: HandlerDeps) {
  async function run(workspaceId: string | undefined, ctx: HandlerContext, args: string[], body?: string): Promise<unknown> {
    const status = await deps.status();
    if (!status.ok || !status.cliPath) throw new Error(`aska ≥ 0.3.0 not found: ${status.reason ?? "unknown reason"}`);
    const cwd = await deps.cwd(workspaceId, ctx.paseo);
    try {
      return await deps.call({ cliPath: status.cliPath, cwd, args, ...(body !== undefined ? { body } : {}) });
    } catch (e) {
      if (!deps.exists(status.cliPath)) deps.invalidate();
      throw e;
    }
  }

  return {
    status: () => deps.status(),
    async list({ workspaceId }: RpcInput<typeof catalogListRpc>, ctx: HandlerContext) {
      return parseOutput(listingSchema, await run(workspaceId, ctx, ["list", "--json"]), "list");
    },
    async show({ workspaceId, kind, name, scope }: RpcInput<typeof fileShowRpc>, ctx: HandlerContext) {
      const args = ["show", kind, name, ...(scope ? ["--scope", scope] : []), "--json"];
      return parseOutput(showSchema, await run(workspaceId, ctx, args), "show");
    },
    async patch({ workspaceId, kind, name, scope, patch, expectHash }: RpcInput<typeof filePatchRpc>, ctx: HandlerContext) {
      const args = ["patch", kind, name, "--scope", scope, "--expect-hash", expectHash, "--json"];
      return parseOutput(writeSchema, await run(workspaceId, ctx, args, JSON.stringify(patch)), "patch");
    },
    async save({ workspaceId, kind, name, scope, markdown, expectHash }: RpcInput<typeof fileSaveRpc>, ctx: HandlerContext) {
      const args = ["save", kind, name, "--scope", scope, "--expect-hash", expectHash, "--json"];
      return parseOutput(writeSchema, await run(workspaceId, ctx, args, markdown), "save");
    },
    async remove({ workspaceId, kind, name, scope, force }: RpcInput<typeof fileDeleteRpc>, ctx: HandlerContext) {
      const args = ["delete", kind, name, "--scope", scope, ...(force ? ["--force"] : []), "--json"];
      return parseOutput(deleteSchema, await run(workspaceId, ctx, args), "delete");
    },
  };
}
