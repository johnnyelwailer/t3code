// @effect-diagnostics nodeBuiltinImport:off -- Plain sync sha256 hash; content-addressed blob keys must stay byte-identical, not become an Effect requiring Crypto.
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as NodeCrypto from "node:crypto";

/** The content-addressed context blob cache, relative to the project state dir. Every file in it
 * is re-creatable from its source (a blob missing on disk is rewritten by the next write) and
 * tracked as purgeable in `t3team_context_blobs`, so it is machine-local cache, never project
 * state to migrate or commit. */
export const T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS = ["context", "_blobs"] as const;

export const T3TEAM_CONTEXT_BLOB_ROOT = `${PROJECT_STATE_DIR}/${T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS.join("/")}`;

export function hashT3TeamContextBytes(bytes: Uint8Array): string {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export function buildT3TeamContextBlobRelativePath(sha256: string): string {
  return `${T3TEAM_CONTEXT_BLOB_ROOT}/${sha256.slice(0, 2)}/${sha256}`;
}

export function decodeT3TeamContextFileBytes(file: {
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
}): Uint8Array {
  return file.encoding === "base64"
    ? Uint8Array.from(Buffer.from(file.contents, "base64"))
    : new TextEncoder().encode(file.contents);
}

export function t3teamContextArtifactKind(encoding?: "utf8" | "base64"): string {
  return encoding === "base64" ? "attachment" : "context-file";
}
