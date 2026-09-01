import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
export const isJsonObject = Schema.is(JsonObject);
const decodeJsonObjectOption = Schema.decodeUnknownOption(Schema.fromJsonString(JsonObject));

export function splitJsonl(contents: string): {
  readonly lines: ReadonlyArray<string>;
  readonly newline: string;
  readonly trailingNewline: boolean;
} {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = contents.endsWith("\n");
  const lines = contents.split(/\r?\n/);
  return {
    lines: trailingNewline ? lines.slice(0, -1) : lines,
    newline,
    trailingNewline,
  };
}

export function joinJsonl(
  lines: ReadonlyArray<string | undefined>,
  newline: string,
  trailingNewline: boolean,
): string {
  const contents = lines.filter((line): line is string => line !== undefined).join(newline);
  return trailingNewline ? `${contents}${newline}` : contents;
}

export function parseJsonObject(line: string): Record<string, unknown> | undefined {
  const decoded = decodeJsonObjectOption(line);
  return Option.isSome(decoded) ? decoded.value : undefined;
}
