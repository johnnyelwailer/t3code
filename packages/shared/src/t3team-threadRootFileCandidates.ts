/**
 * Where else a relative file reference from a thread may live: the same path joined onto each of
 * the thread's other roots (child worktrees, linked or meta-repo checkouts). Upstream's thread
 * evidence (`threadFilePaths`) only finds files the agent visibly touched; a child worktree under
 * a gitignored folder is invisible to the file index, so the roots fill that gap.
 *
 * These are unverified suggestions in priority order: the emitting agent's own root first, then
 * the rest in roots order. The caller verifies each one (the file must exist) and takes the first
 * hit; the ordinary root-joined target always wins when it exists, so `cwd` is left out here.
 */
import {
  isAbsolutePath,
  isWindowsAbsolutePath,
  normalizeProjectPathForComparison,
} from "./path.ts";

function cleanReference(relativePath: string): string | null {
  const reference = relativePath
    .trim()
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "");
  if (reference.length === 0 || reference.startsWith("~") || isAbsolutePath(reference)) {
    return null;
  }
  const segments = reference.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  return reference;
}

function joinRoot(root: string, reference: string): string {
  const windows = isWindowsAbsolutePath(root);
  const separator = windows ? "\\" : "/";
  const base = root.replace(/[/\\]+$/, "");
  return `${base}${separator}${windows ? reference.replaceAll("/", "\\") : reference}`;
}

export function threadRootFileCandidates(
  relativePath: string,
  input: {
    /** The thread's active roots, in display order. */
    readonly roots: ReadonlyArray<string>;
    /** The folder the ordinary resolver already joins onto; skipped. */
    readonly cwd?: string | null;
    /** The root of the agent that wrote the reference; tried first. */
    readonly emittingRoot?: string | null;
  },
): string[] {
  const reference = cleanReference(relativePath);
  if (reference === null) return [];
  const ordered = input.emittingRoot ? [input.emittingRoot, ...input.roots] : [...input.roots];
  const seen = new Set<string>();
  if (input.cwd) seen.add(normalizeProjectPathForComparison(input.cwd));
  const candidates: string[] = [];
  for (const root of ordered) {
    const trimmed = root.trim();
    if (trimmed.length === 0 || !isAbsolutePath(trimmed)) continue;
    const key = normalizeProjectPathForComparison(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(joinRoot(trimmed, reference));
  }
  return candidates;
}
