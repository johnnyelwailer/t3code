import * as NodeCrypto from "node:crypto";

export const T3WORK_CONTEXT_BLOB_ROOT = ".t3work/context/_blobs";

export function hashT3workContextBytes(bytes: Uint8Array): string {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export function buildT3workContextBlobRelativePath(sha256: string): string {
  return `${T3WORK_CONTEXT_BLOB_ROOT}/${sha256.slice(0, 2)}/${sha256}`;
}

export function decodeT3workContextFileBytes(file: {
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
}): Uint8Array {
  return file.encoding === "base64"
    ? Uint8Array.from(Buffer.from(file.contents, "base64"))
    : new TextEncoder().encode(file.contents);
}

export function t3workContextArtifactKind(encoding?: "utf8" | "base64"): string {
  return encoding === "base64" ? "attachment" : "context-file";
}
