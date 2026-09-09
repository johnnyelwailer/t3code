import type { FileDiffMetadata } from "@pierre/diffs";

import {
  buildFileDiffRenderKey,
  resolveFileDiffPath,
  resolveFileDiffPreviousPath,
} from "~/lib/diffRendering";

/** Pure logic for the PR diff explorer: one file at a time, with a viewed-checkbox file tree. */

export interface DiffExplorerFile {
  readonly key: string;
  readonly path: string;
  readonly oldPath: string | null;
  readonly additions: number;
  readonly deletions: number;
}

export type DiffExplorerNode =
  | {
      readonly kind: "directory";
      readonly path: string;
      readonly name: string;
      readonly children: readonly DiffExplorerNode[];
    }
  | { readonly kind: "file"; readonly file: DiffExplorerFile };

/** The tree under construction: mutable, one directory node per path. */
interface MutableNode {
  readonly kind: "directory" | "file";
  readonly path: string;
  readonly name: string;
  readonly file?: DiffExplorerFile;
  readonly children: MutableNode[];
}

/** A parsed diff file's stable key, both paths, and summed add/remove counts. */
export function diffExplorerFileInfo(file: FileDiffMetadata): DiffExplorerFile {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  const path = resolveFileDiffPath(file);
  const oldPath = resolveFileDiffPreviousPath(file);
  return {
    key: buildFileDiffRenderKey(file),
    path,
    oldPath: oldPath === path ? null : oldPath,
    additions,
    deletions,
  };
}

/** Group the ordered file list into a directory tree, preserving diff order. */
export function buildDiffExplorerTree(
  files: readonly DiffExplorerFile[],
): readonly DiffExplorerNode[] {
  const roots: MutableNode[] = [];
  const directories = new Map<string, MutableNode>();

  const directoryFor = (path: string): MutableNode => {
    const existing = directories.get(path);
    if (existing) return existing;
    const created: MutableNode = {
      kind: "directory",
      path,
      name: path.slice(0, -1).split("/").at(-1) ?? path,
      children: [],
    };
    directories.set(path, created);
    return created;
  };

  const freeze = (node: MutableNode): DiffExplorerNode => {
    if (node.kind === "file") {
      const file = node.file;
      if (file === undefined) throw new Error(`File node without a file: ${node.path}`);
      return { kind: "file", file };
    }
    return {
      kind: "directory",
      path: node.path,
      name: node.name,
      children: node.children.map(freeze),
    };
  };

  for (const file of files) {
    const fileNode: MutableNode = {
      kind: "file",
      path: file.path,
      name: file.path.split("/").at(-1) ?? file.path,
      file,
      children: [],
    };
    const segments = file.path.split("/");
    if (segments.length === 1) {
      roots.push(fileNode);
      continue;
    }
    let level = roots;
    let directory = "";
    for (const segment of segments.slice(0, -1)) {
      directory += `${segment}/`;
      const node = directoryFor(directory);
      // A directory seen by an earlier file already sits in its parent's children, at the
      // position of its first entry: never append it a second time.
      if (!level.includes(node)) level.push(node);
      level = node.children;
    }
    level.push(fileNode);
  }
  return roots.map(freeze);
}

/** Collapse lone directory chains into a single `a/b/c` row; leaf file paths are kept intact. */
export function compactDiffExplorerTree(
  nodes: readonly DiffExplorerNode[],
): readonly DiffExplorerNode[] {
  return nodes.map((node) =>
    node.kind === "directory" ? compactDiffExplorerDirectory(node) : node,
  );
}

type DiffExplorerDirectoryNode = Extract<DiffExplorerNode, { readonly kind: "directory" }>;

function compactDiffExplorerDirectory(
  directory: DiffExplorerDirectoryNode,
): DiffExplorerDirectoryNode {
  const compactedChildren = directory.children.map((child) =>
    child.kind === "directory" ? compactDiffExplorerDirectory(child) : child,
  );
  const loneChild = compactedChildren.length === 1 ? compactedChildren[0] : undefined;
  if (loneChild?.kind === "directory") {
    return {
      ...directory,
      name: `${directory.name}/${loneChild.name}`,
      children: loneChild.children,
    };
  }
  return { ...directory, children: compactedChildren };
}

/** How many files hang off this subtree, for the directory row's count badge. */
export function diffExplorerFileCount(nodes: readonly DiffExplorerNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += node.kind === "file" ? 1 : diffExplorerFileCount(node.children);
  }
  return count;
}

/** Every directory path in the tree, so "collapse all" starts from a known set. */
export function diffExplorerDirectoryPaths(nodes: readonly DiffExplorerNode[]): readonly string[] {
  const paths: string[] = [];
  const walk = (level: readonly DiffExplorerNode[]) => {
    for (const child of level) {
      if (child.kind === "directory") {
        paths.push(child.path);
        walk(child.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

export function toggleViewedFile(
  viewed: ReadonlySet<string>,
  fileKey: string,
): ReadonlySet<string> {
  const next = new Set(viewed);
  if (next.has(fileKey)) next.delete(fileKey);
  else next.add(fileKey);
  return next;
}

export function markAllFilesViewed(files: readonly DiffExplorerFile[]): ReadonlySet<string> {
  return new Set(files.map((file) => file.key));
}

export function countViewedFiles(
  files: readonly DiffExplorerFile[],
  viewed: ReadonlySet<string>,
): { readonly viewed: number; readonly total: number } {
  let counted = 0;
  for (const file of files) if (viewed.has(file.key)) counted++;
  return { viewed: counted, total: files.length };
}

/** The file before `currentKey`, or the last file when nothing is before it (wraps for prev). */
export function previousDiffExplorerFile(
  files: readonly DiffExplorerFile[],
  currentKey: string,
): DiffExplorerFile | null {
  if (files.length === 0) return null;
  const index = files.findIndex((file) => file.key === currentKey);
  if (index <= 0) return files[files.length - 1] ?? null;
  return files[index - 1] ?? null;
}

/** The file after `currentKey`, or the first file when nothing is after it (wraps for next). */
export function nextDiffExplorerFile(
  files: readonly DiffExplorerFile[],
  currentKey: string,
): DiffExplorerFile | null {
  if (files.length === 0) return null;
  const index = files.findIndex((file) => file.key === currentKey);
  if (index < 0 || index === files.length - 1) return files[0] ?? null;
  return files[index + 1] ?? null;
}
