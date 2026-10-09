/**
 * Bounded pages over a provider's diff slices for `ctx.changeRequests.diff`.
 *
 * A provider hands a diff over in slices of whole files under its own opaque cursor
 * (`PullRequestDiffResult.nextCursor`), sized by the provider rather than the reader. A script
 * page is cut from one slice: at most `pageSize` files and `CHANGE_REQUEST_DIFF_MAX_PAGE_CHARS`
 * of patch. The page cursor is therefore a position, the slice's own cursor plus a file offset
 * within it; re-reading a slice to reach the next offset is a `PullRequestService` cache read.
 */
import {
  CHANGE_REQUEST_DIFF_DEFAULT_PAGE_SIZE,
  CHANGE_REQUEST_DIFF_MAX_PAGE_CHARS,
  CHANGE_REQUEST_DIFF_MAX_PAGE_SIZE,
} from "@t3team/sdk";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

/** Where a page starts: a provider slice (null = the first) and a file offset inside it. */
export interface DiffPagePosition {
  readonly slice: string | null;
  readonly offset: number;
}

const CursorJson = Schema.fromJsonString(
  Schema.Tuple([
    Schema.NullOr(Schema.NonEmptyString),
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  ]),
);
const decodeCursorJson = Schema.decodeUnknownOption(CursorJson);

export const encodeDiffCursor = (position: DiffPagePosition): string =>
  Base64Url.encode(JSON.stringify([position.slice, position.offset]));

/** Null for a cursor this module did not issue. */
export function decodeDiffCursor(cursor: string | undefined): DiffPagePosition | null {
  if (cursor === undefined) return { slice: null, offset: 0 };
  const text = Base64Url.decodeString(cursor);
  if (Result.isFailure(text)) return null;
  return Option.match(decodeCursorJson(text.success), {
    onNone: () => null,
    onSome: ([slice, offset]) => ({ slice, offset }),
  });
}

export function clampDiffPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    return CHANGE_REQUEST_DIFF_DEFAULT_PAGE_SIZE;
  }
  return Math.min(CHANGE_REQUEST_DIFF_MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
}

const FILE_HEADER = "\ndiff --git ";

/**
 * A unified patch cut at each `diff --git` header. Every provider adapter writes one per file;
 * a hunk line always starts with a prefix character, so the header cannot occur inside a hunk.
 */
export function splitPatchFiles(patch: string): ReadonlyArray<string> {
  if (patch.length === 0) return [];
  const files: string[] = [];
  let start = 0;
  let at = patch.indexOf(FILE_HEADER);
  while (at !== -1) {
    files.push(patch.slice(start, at + 1));
    start = at + 1;
    at = patch.indexOf(FILE_HEADER, start);
  }
  files.push(patch.slice(start));
  return files;
}

/** A file too long for a page on its own, cut at a line end. */
function cutFile(file: string, limit: number): string {
  const lineEnd = file.lastIndexOf("\n", limit - 1);
  return file.slice(0, lineEnd > 0 ? lineEnd + 1 : limit);
}

export function takeDiffPage(
  files: ReadonlyArray<string>,
  offset: number,
  pageSize: number,
  maxChars: number = CHANGE_REQUEST_DIFF_MAX_PAGE_CHARS,
): { readonly patch: string; readonly fileCount: number; readonly truncated: boolean } {
  const picked: string[] = [];
  let chars = 0;
  for (let index = offset; index < files.length && picked.length < pageSize; index += 1) {
    const file = files[index]!;
    if (file.length > maxChars - chars) {
      if (picked.length > 0) break;
      return { patch: cutFile(file, maxChars), fileCount: 1, truncated: true };
    }
    picked.push(file);
    chars += file.length;
  }
  return { patch: picked.join(""), fileCount: picked.length, truncated: false };
}
