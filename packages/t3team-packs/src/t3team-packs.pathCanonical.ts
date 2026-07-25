// @effect-diagnostics nodeBuiltinImport:off - containment must consult the real filesystem (symlinks).
/**
 * Canonical path containment — the ONE ancestry check every pack/recipe path guard uses.
 *
 * A purely lexical check (`path.resolve` + `path.relative`) answers the wrong question: it proves
 * the STRING sits under the root, not the FILE. A recipe directory that IS a symlink, or a symlink
 * nested under a valid root, passes lexical containment and is then read or executed from wherever
 * the link points. So both sides are canonicalized with `realpath` before the ancestry test.
 *
 * Paths that do not exist yet must neither crash nor become a bypass: the deepest EXISTING ancestor
 * is canonicalized (so no symlink survives in the resolved prefix) and the still-missing tail is
 * re-appended literally. The tail can contain no `..`, because the input is resolved first.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * Absolute, symlink-free form of `target`. For a path that does not exist, the nearest existing
 * ancestor is canonicalized and the missing segments are appended verbatim.
 */
export function canonicalizePath(target: string): string {
  const absolute = NodePath.resolve(target);
  let current = absolute;
  const missing: string[] = [];
  for (;;) {
    try {
      const real = NodeFS.realpathSync(current);
      return missing.length === 0 ? real : NodePath.join(real, ...missing);
    } catch {
      const parent = NodePath.dirname(current);
      if (parent === current) {
        // Not even the filesystem root resolved; the lexical form is the best available answer.
        return absolute;
      }
      missing.unshift(NodePath.basename(current));
      current = parent;
    }
  }
}

/**
 * Whether `resolvedTarget` is the canonical root itself or lives below it. Both operands are
 * canonicalized, so a symlink anywhere on either path cannot smuggle the target out of the root.
 */
export function isWithinCanonicalRoot(rootPath: string, resolvedTarget: string): boolean {
  const root = canonicalizePath(rootPath);
  const target = canonicalizePath(resolvedTarget);
  if (target === root) {
    return true;
  }
  const relative = NodePath.relative(root, target);
  return !(
    relative === ".." ||
    relative.startsWith(`..${NodePath.sep}`) ||
    NodePath.isAbsolute(relative)
  );
}
