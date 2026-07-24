import * as NodePath from "node:path";

export function resolvePackAssetPath(packDirectory: string, path: string): string {
  if (NodePath.isAbsolute(path)) throw new Error(`Pack asset path must be relative: ${path}`);
  const root = NodePath.resolve(packDirectory);
  const resolved = NodePath.resolve(root, path);
  if (resolved === root || !resolved.startsWith(`${root}${NodePath.sep}`)) {
    throw new Error(`Pack asset path escapes its pack directory: ${path}`);
  }
  return resolved;
}
