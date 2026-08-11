import type { GitHubPullRequestContextFile } from "./t3team-github-routes-pr-types.ts";

/**
 * Reconstructs GitHub's per-file `files` shape (filename/status/additions/deletions/patch) from
 * one unified diff string, the way `PullRequestService.diff` hands one over. GitHub's REST API
 * used to give us this list directly; upstream's pull request layer only gives the whole diff as
 * one opaque patch, so this is the seam that lets the pr-context bundle renderers keep reading the
 * same per-file shape without themselves changing.
 */

const DIFF_HEADER_PATTERN = /^diff --git a\/(.+) b\/(.+)$/;

interface ParsedFileBlock {
  readonly oldPath: string;
  readonly newPath: string;
  readonly lines: ReadonlyArray<string>;
}

/** Splits a multi-file unified diff into the block of lines belonging to each file. */
function splitIntoFileBlocks(diff: string): ReadonlyArray<ParsedFileBlock> {
  const lines = diff.split("\n");
  const blocks: ParsedFileBlock[] = [];
  let current: { oldPath: string; newPath: string; lines: string[] } | null = null;

  for (const line of lines) {
    const header = DIFF_HEADER_PATTERN.exec(line);
    if (header) {
      if (current) blocks.push(current);
      current = { oldPath: header[1]!, newPath: header[2]!, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function isBinaryBlock(lines: ReadonlyArray<string>): boolean {
  return lines.some(
    (line) => line.startsWith("Binary files ") || line.startsWith("GIT binary patch"),
  );
}

function resolveStatus(block: ParsedFileBlock): {
  readonly status: "added" | "removed" | "renamed" | "modified";
  readonly previousFilename?: string;
} {
  const isNewFile = block.lines.some((line) => line.startsWith("new file mode"));
  const isDeletedFile = block.lines.some((line) => line.startsWith("deleted file mode"));
  const renameFrom = block.lines
    .find((line) => line.startsWith("rename from "))
    ?.slice("rename from ".length);
  const renameTo = block.lines
    .find((line) => line.startsWith("rename to "))
    ?.slice("rename to ".length);

  if (isNewFile) return { status: "added" };
  if (isDeletedFile) return { status: "removed" };
  if (renameFrom && renameTo) return { status: "renamed", previousFilename: renameFrom };
  if (block.oldPath !== block.newPath) {
    return { status: "renamed", previousFilename: block.oldPath };
  }
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

function countChanges(lines: ReadonlyArray<string>): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
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
    const binary = isBinaryBlock(block.lines);
    const { status, previousFilename } = resolveStatus(block);
    const patch = binary ? undefined : extractPatch(block.lines);
    const { additions, deletions } = binary
      ? { additions: 0, deletions: 0 }
      : countChanges(block.lines);

    return {
      filename: block.newPath,
      status,
      additions,
      deletions,
      changes: additions + deletions,
      ...(patch ? { patch } : {}),
      ...(previousFilename ? { previous_filename: previousFilename } : {}),
    } satisfies GitHubPullRequestContextFile;
  });
}
