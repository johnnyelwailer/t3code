/**
 * Pure shaping of one file's bytes into a `ChangeRequestFileAt` answer: binary detection, line
 * ranges, and the line/character caps. No I/O, so the caps are tested without a provider.
 */
import {
  CHANGE_REQUEST_FILE_MAX_CHARS,
  CHANGE_REQUEST_FILE_MAX_LINES,
  ChangeRequestInputError,
  type ChangeRequestFileAt,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";

export interface FileLineRange {
  readonly startLine: number;
  readonly endLine: number;
}

/** A range a script wrote wrong is its own error; a range past the end of the file is not. */
export function validateRange(
  range: FileLineRange | undefined,
): Effect.Effect<FileLineRange, ChangeRequestInputError> {
  if (range === undefined) {
    // No range asked for means the whole file, so a cut at the caps is reported as truncated.
    return Effect.succeed({ startLine: 1, endLine: Number.MAX_SAFE_INTEGER });
  }
  const { startLine, endLine } = range;
  return Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine >= 1 &&
    endLine >= startLine
    ? Effect.succeed(range)
    : Effect.fail(
        new ChangeRequestInputError(
          `Invalid line range ${startLine}-${endLine}: 1-based, whole numbers, end not before start.`,
        ),
      );
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** The bytes as text, or null for a binary file: a NUL byte, or bytes that are not UTF-8. */
export function decodeText(content: Uint8Array): string | null {
  if (content.includes(0)) return null;
  try {
    return decoder.decode(content);
  } catch {
    return null;
  }
}

/** The lines `range` asks for, cut at the line cap and again at the character cap. */
export function sliceLines(
  text: string,
  range: FileLineRange,
): Pick<
  Extract<ChangeRequestFileAt, { kind: "text" }>,
  "text" | "startLine" | "endLine" | "totalLines" | "truncated"
> {
  const lines = text.split("\n");
  // A trailing newline ends the last line rather than starting an empty one.
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  const totalLines = text === "" ? 0 : lines.length;
  const requestedEnd = Math.min(range.endLine, totalLines);
  const cappedEnd = Math.min(requestedEnd, range.startLine + CHANGE_REQUEST_FILE_MAX_LINES - 1);
  const picked: string[] = [];
  let chars = 0;
  let lineCut = false;
  for (let line = range.startLine; line <= cappedEnd; line += 1) {
    const next = lines[line - 1]!;
    if (picked.length > 0 && chars + next.length + 1 > CHANGE_REQUEST_FILE_MAX_CHARS) break;
    // One line longer than the whole cap is cut, and the answer says so even though the line
    // count reached the requested end.
    const cut = next.length > CHANGE_REQUEST_FILE_MAX_CHARS;
    lineCut ||= cut;
    picked.push(cut ? next.slice(0, CHANGE_REQUEST_FILE_MAX_CHARS) : next);
    chars += next.length + 1;
  }
  const endLine = range.startLine + picked.length - 1;
  return {
    text: picked.join("\n"),
    startLine: range.startLine,
    endLine,
    totalLines,
    truncated: lineCut || endLine < requestedEnd,
  };
}
