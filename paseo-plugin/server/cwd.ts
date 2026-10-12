import { join } from "node:path";

export const NO_PROJECT_DIR = "aska-editor-noproject";

// The slice of the Paseo SDK the handlers use; PaseoApi satisfies it structurally.
export interface WorkspaceLookup {
  workspaces: { ref(id: string): { refresh(): Promise<{ workspaceDirectory?: string } | null> } };
}

export interface CwdDeps {
  tmpDir: string;
  ensureDir: (path: string) => Promise<void>;
  workspaceDirectory: (id: string) => Promise<string | null>;
}

// Without a workspace, the CLI runs in an empty folder the plugin owns. Running from ~ would make
// it treat ~/.claude as a project scope.
export async function chooseCwd(workspaceId: string | undefined, deps: CwdDeps): Promise<string> {
  if (workspaceId === undefined) {
    const dir = join(deps.tmpDir, NO_PROJECT_DIR);
    await deps.ensureDir(dir);
    return dir;
  }
  const dir = await deps.workspaceDirectory(workspaceId);
  if (!dir) throw new Error(`Workspace ${workspaceId} has no directory on this host`);
  return dir;
}
