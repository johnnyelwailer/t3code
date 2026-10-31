import { decodeJsonResult } from "@t3tools/shared/schemaJson";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const RepositoryFile = Schema.Struct({
  encoding: Schema.String,
  content: Schema.String,
});
const decodeRepositoryFile = decodeJsonResult(RepositoryFile);

/** The bytes of a `repository/files/:path` answer, or null when it carries no base64 content. */
export function repositoryFileBytes(raw: string): Uint8Array | null {
  const decoded = decodeRepositoryFile(raw);
  return Result.isSuccess(decoded) && decoded.success.encoding === "base64"
    ? new Uint8Array(Buffer.from(decoded.success.content, "base64"))
    : null;
}

/** Room for `maxBytes` of file once base64 encoded, plus the JSON envelope. */
export function repositoryFileOutputBudget(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4 + 64 * 1024;
}
