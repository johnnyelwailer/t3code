/**
 * Other-root candidates for a relative file: the same path on each of the thread's other roots,
 * agent's own root first. The caller verifies existence and takes the first hit; cwd is omitted
 * because the ordinary root-joined target already covers it.
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

/** One batched stat: each path's kind, or `null` when it is missing; `null` overall on failure. */
type StatPaths = (
  paths: ReadonlyArray<string>,
) => Promise<ReadonlyArray<"file" | "directory" | "other" | null> | null>;

/**
 * The first existing file among the thread's other roots for a relative reference, or `null`.
 * The ordinary cwd-joined file always wins: when it exists this returns `null` so the caller
 * keeps its normal target. Threads with no extra roots never stat anything.
 */
export async function findThreadRootFileMatch(input: {
  readonly relativePath: string;
  readonly roots: ReadonlyArray<string>;
  readonly cwd: string | null | undefined;
  readonly emittingRoot?: string | null;
  readonly stat: StatPaths;
}): Promise<string | null> {
  const candidates = threadRootFileCandidates(input.relativePath, input);
  if (candidates.length === 0) return null;
  const own = input.cwd ? threadRootFileCandidates(input.relativePath, { roots: [input.cwd] }) : [];
  const kinds = await input.stat([...own, ...candidates]);
  if (kinds === null) return null;
  if (own.length > 0 && kinds[0] === "file") return null;
  const offset = own.length;
  const index = candidates.findIndex((_, k) => kinds[offset + k] === "file");
  return index === -1 ? null : candidates[index]!;
}
