import * as NodePath from "node:path";

import { isWithinCanonicalRoot } from "./t3work-packs.pathCanonical.ts";

export function resolvePackAssetPath(packDirectory: string, path: string): string {
  if (NodePath.isAbsolute(path)) throw new Error(`Pack asset path must be relative: ${path}`);
  const root = NodePath.resolve(packDirectory);
  const resolved = NodePath.resolve(root, path);
  // Canonical (realpath) ancestry, not string prefixing: a pack asset directory that IS a symlink,
  // or one reached through a nested symlink, must not be read from outside the pack.
  if (resolved === root || !isWithinCanonicalRoot(root, resolved)) {
    throw new Error(`Pack asset path escapes its pack directory: ${path}`);
  }
  return resolved;
}
