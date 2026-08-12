import type { GitHubPullRequestContextFile } from "./t3team-github-routes-pr-types.ts";

/**
 * Reconstructs GitHub's per-file `files` shape (filename/status/additions/deletions/patch) from
 * one unified diff string, the way `PullRequestService.diff` hands one over. GitHub's REST API
 * used to give us this list directly; upstream's pull request layer only gives the whole diff as
 * one opaque patch, so this is the seam that lets the pr-context bundle renderers keep reading the
 * same per-file shape without themselves changing.
 */

interface ParsedFileBlock {
  /** The raw `diff --git ...` line, kept only as a last-resort path source. */
  readonly headerLine: string;
  readonly lines: ReadonlyArray<string>;
}

/** Splits a multi-file unified diff into the block of lines belonging to each file. */
function splitIntoFileBlocks(diff: string): ReadonlyArray<ParsedFileBlock> {
  const lines = diff.split("\n");
  const blocks: ParsedFileBlock[] = [];
  let current: { headerLine: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) blocks.push(current);
      current = { headerLine: line, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Git quotes a non-ASCII byte in a path as a 3-digit octal escape (`core.quotePath`'s default),
 * so `café.txt` becomes `caf\303\251.txt` — the two escapes are the UTF-8 bytes of "é", not two
 * separate characters. A plain `\\(.)`-style unescape would consume `\3` as an escaped "3" and
 * garble the rest. This instead assembles the raw byte sequence (octal escapes as their byte,
 * everything else re-encoded to UTF-8) and decodes it once, at the end, as UTF-8 text.
 */
function unescapeQuoted(raw: string): string {
  const bytes: Array<number> = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char === "\\") {
      const octal = /^[0-7]{3}/.exec(raw.slice(i + 1, i + 4));
      if (octal) {
        bytes.push(Number.parseInt(octal[0], 8));
        i += 3;
        continue;
      }
      const escaped = raw[i + 1];
      if (escaped !== undefined) {
        bytes.push(...encoder.encode(escaped));
        i += 1;
        continue;
      }
    }
    bytes.push(...encoder.encode(char));
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}

/**
 * The `diff --git` line itself, quoted (`"a/x y" "b/x y"`, escaped quotes/backslashes allowed) or
 * plain. Plain paths are ambiguous wherever they contain their own literal `" b/"` — git never
 * quotes a path for spaces alone — so the non-rename case (paths equal once the `a/`/`b/` prefix
 * is stripped) is resolved exactly, by requiring the two halves to match; a genuine unquoted
 * rename through an ambiguous path falls back to the first `" b/"`, same as before this fix.
 */
function parseDiffGitHeaderLine(line: string): { old: string; new: string } | null {
  const rest = line.slice("diff --git ".length);
  const quoted = /^"((?:\\.|[^"\\])*)" "((?:\\.|[^"\\])*)"$/.exec(rest);
  if (quoted) {
    const old = unescapeQuoted(quoted[1]!);
    const next = unescapeQuoted(quoted[2]!);
    return { old: old.replace(/^a\//, ""), new: next.replace(/^b\//, "") };
  }
  if (!rest.startsWith("a/")) return null;
  const afterA = rest.slice(2);
  const candidates: Array<{ old: string; new: string }> = [];
  let searchFrom = 0;
  for (;;) {
    const idx = afterA.indexOf(" b/", searchFrom);
    if (idx === -1) break;
    candidates.push({ old: afterA.slice(0, idx), new: afterA.slice(idx + 3) });
    searchFrom = idx + 1;
  }
  const exact = candidates.find((candidate) => candidate.old === candidate.new);
  return exact ?? candidates[0] ?? null;
}

function stripDevNullPrefix(line: string, prefix: string, devNull: string): string | null {
  if (line === devNull) return null;
  return line.startsWith(prefix) ? line.slice(prefix.length) : null;
}

/**
 * The header line is only a fallback: `---`/`+++` (or `rename from`/`rename to`) are authoritative
 * whenever present, because they carry one path each with no ambiguity to resolve, unlike the
 * combined `diff --git a/... b/...` line.
 */
function resolvePaths(block: ParsedFileBlock): { oldPath: string; newPath: string } {
  const renameFrom = block.lines
    .find((line) => line.startsWith("rename from "))
    ?.slice("rename from ".length);
  const renameTo = block.lines
    .find((line) => line.startsWith("rename to "))
    ?.slice("rename to ".length);
  if (renameFrom !== undefined && renameTo !== undefined) {
    return { oldPath: renameFrom, newPath: renameTo };
  }

  const minusLine = block.lines.find((line) => line.startsWith("--- "));
  const plusLine = block.lines.find((line) => line.startsWith("+++ "));
  const fromMinus = minusLine ? stripDevNullPrefix(minusLine, "--- a/", "--- /dev/null") : null;
  const fromPlus = plusLine ? stripDevNullPrefix(plusLine, "+++ b/", "+++ /dev/null") : null;
  if (fromMinus !== null || fromPlus !== null) {
    return { oldPath: fromMinus ?? fromPlus!, newPath: fromPlus ?? fromMinus! };
  }

  const fromHeader = parseDiffGitHeaderLine(block.headerLine);
  if (fromHeader) return { oldPath: fromHeader.old, newPath: fromHeader.new };
  return { oldPath: "unknown", newPath: "unknown" };
}

function isBinaryBlock(lines: ReadonlyArray<string>): boolean {
  return lines.some(
    (line) => line.startsWith("Binary files ") || line.startsWith("GIT binary patch"),
  );
}

function resolveStatus(
  block: ParsedFileBlock,
  paths: { oldPath: string; newPath: string },
): { readonly status: "added" | "removed" | "renamed" | "modified" } {
  const isNewFile = block.lines.some((line) => line.startsWith("new file mode"));
  const isDeletedFile = block.lines.some((line) => line.startsWith("deleted file mode"));
  const isRename = block.lines.some((line) => line.startsWith("rename from "));

  if (isNewFile) return { status: "added" };
  if (isDeletedFile) return { status: "removed" };
  if (isRename || paths.oldPath !== paths.newPath) return { status: "renamed" };
  return { status: "modified" };
}

/** GitHub's `patch` field is the hunks only, without the `diff --git`/`index`/`---`/`+++` preamble. */
function extractPatch(lines: ReadonlyArray<string>): string | undefined {
  const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunkIndex === -1) return undefined;
  // Trailing blank line from the final `\n` of the diff text.
  const patchLines = lines.slice(firstHunkIndex);
  while (patchLines.length > 0 && patchLines[patchLines.length - 1] === "") {
    patchLines.pop();
  }
  return patchLines.join("\n");
}

/**
 * `---`/`+++` only mean "file header" in the preamble before the first hunk; inside a hunk they
 * are ordinary two-character content (an added line starting "++", a removed line starting "--")
 * with the diff's own `+`/`-` marker in front of it, and must count as such.
 */
function countChanges(lines: ReadonlyArray<string>): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk && (line.startsWith("+++") || line.startsWith("---"))) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

/**
 * Parses a whole unified diff (as `PullRequestService.diff` hands it over, concatenated across
 * pages) into the per-file rows the pr-context bundle renderers expect.
 */
export function parseUnifiedDiffToFiles(diff: string): ReadonlyArray<GitHubPullRequestContextFile> {
  return splitIntoFileBlocks(diff).map((block) => {
    const paths = resolvePaths(block);
    const binary = isBinaryBlock(block.lines);
    const { status } = resolveStatus(block, paths);
    const patch = binary ? undefined : extractPatch(block.lines);
    const { additions, deletions } = binary
      ? { additions: 0, deletions: 0 }
      : countChanges(block.lines);

    return {
      filename: paths.newPath,
      status,
      additions,
      deletions,
      changes: additions + deletions,
      ...(patch ? { patch } : {}),
      ...(status === "renamed" ? { previous_filename: paths.oldPath } : {}),
    } satisfies GitHubPullRequestContextFile;
  });
}
