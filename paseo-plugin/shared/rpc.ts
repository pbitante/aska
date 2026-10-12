import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  deleteSchema,
  expectHashSchema,
  kindSchema,
  listingSchema,
  nameSchema,
  patchSchema,
  readScopeSchema,
  refSchema,
  showSchema,
  statusSchema,
  writeSchema,
  writeScopeSchema,
} from "./schemas";

const workspaceId = z.string().min(1).optional();

export const askaStatusRpc = defineRpc({ name: "aska.status", input: z.object({}), output: statusSchema });

export const catalogListRpc = defineRpc({ name: "catalog.list", input: z.object({ workspaceId }), output: listingSchema });

export const fileShowRpc = defineRpc({
  name: "file.show",
  input: z.object({ workspaceId, kind: kindSchema, name: refSchema, scope: readScopeSchema.optional() }),
  output: showSchema,
});

export const filePatchRpc = defineRpc({
  name: "file.patch",
  input: z.object({ workspaceId, kind: kindSchema, name: nameSchema, scope: writeScopeSchema, patch: patchSchema, expectHash: expectHashSchema }),
  output: writeSchema,
});

export const fileSaveRpc = defineRpc({
  name: "file.save",
  input: z.object({ workspaceId, kind: kindSchema, name: nameSchema, scope: writeScopeSchema, markdown: z.string(), expectHash: expectHashSchema }),
  output: writeSchema,
});

export const fileDeleteRpc = defineRpc({
  name: "file.delete",
  input: z.object({ workspaceId, kind: kindSchema, name: nameSchema, scope: writeScopeSchema, force: z.boolean() }),
  output: deleteSchema,
});
