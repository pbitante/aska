import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// An empty askaCliPath means "use the installed aska plugin".
export const askaSettings = defineSettings({
  id: "aska",
  scope: "host",
  version: 1,
  schema: z.object({ askaCliPath: z.string().default("") }),
});
