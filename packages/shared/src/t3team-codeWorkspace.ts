/**
 * A multi-root editor workspace (`.code-workspace`) for a thread with several active roots
 * (`t3team-threadActiveRoots`): the main checkout plus each child worktree, named by the child or
 * branch. Opening the thread in a VS Code family editor opens this workspace; one root opens the
 * plain folder. The file is written to the server's state directory, never into a repository.
 */
import { normalizeProjectPathForComparison } from "./path.ts";
import type { ThreadActiveRoot } from "./t3team-threadActiveRoots.ts";

/** Editors that open a `.code-workspace` file as a multi-root workspace. */
export const CODE_WORKSPACE_EDITOR_IDS: ReadonlySet<string> = new Set([
  "vscode",
  "vscode-insiders",
  "vscodium",
  "cursor",
  "trae",
  "kiro",
  "antigravity",
]);

export interface CodeWorkspaceFolder {
  readonly path: string;
  readonly name: string;
}

const MAX_NAME_LENGTH = 60;

function baseName(path: string): string {
  const parts = path.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function cleanName(value: string): string {
  const name = value.replace(/\s+/g, " ").trim();
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

/** Folders in roots order, named by label (child or branch) else the folder name; unique names. */
export function codeWorkspaceFolders(
  roots: ReadonlyArray<ThreadActiveRoot>,
): CodeWorkspaceFolder[] {
  const seenPaths = new Set<string>();
  const seenNames = new Map<string, number>();
  const folders: CodeWorkspaceFolder[] = [];
  for (const root of roots) {
    const key = normalizeProjectPathForComparison(root.path);
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    const base = cleanName(root.label ?? "") || cleanName(baseName(root.path)) || "Folder";
    const count = (seenNames.get(base.toLowerCase()) ?? 0) + 1;
    seenNames.set(base.toLowerCase(), count);
    folders.push({ path: root.path, name: count === 1 ? base : `${base} (${count})` });
  }
  return folders;
}

/** The file contents; stable for the same folders so an unchanged workspace is not rewritten. */
export function renderCodeWorkspace(folders: ReadonlyArray<CodeWorkspaceFolder>): string {
  return `${JSON.stringify({ folders: folders.map(({ name, path }) => ({ name, path })), settings: {} }, null, 2)}\n`;
}

/** Stable file name for a thread's open target (FNV-1a over the normalized path). */
export function codeWorkspaceFileName(cwd: string): string {
  const text = normalizeProjectPathForComparison(cwd);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const label = baseName(text)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .slice(0, 40);
  return `${label || "thread"}-${hash.toString(16).padStart(8, "0")}.code-workspace`;
}
