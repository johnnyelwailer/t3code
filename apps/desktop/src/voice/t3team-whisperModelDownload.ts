// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node helper owned by the whisper host.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";

import {
  makeProgressTap,
  type DownloadProgressListener,
} from "./t3team-whisperDownloadProgress.ts";
import { isValidWhisperModelId, whisperModelFileNames } from "./t3team-whisperModelLocator.ts";

const MODEL_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

class WhisperModelDownloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WhisperModelDownloadError";
  }
}

function whisperModelDownloadUrl(model: string): string {
  const [fileName] = whisperModelFileNames(model);
  return `${MODEL_BASE_URL}/${fileName}`;
}

/** Fallback only: used when no model is configured or found on disk. Resumes nothing, so a failed run leaves no partial file behind. */
export async function downloadWhisperModel(input: {
  readonly model: string;
  readonly targetDir: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly onProgress?: DownloadProgressListener;
}): Promise<string> {
  if (!isValidWhisperModelId(input.model)) {
    throw new WhisperModelDownloadError(`"${input.model}" is not a valid whisper model id.`);
  }
  const [fileName] = whisperModelFileNames(input.model);
  const url = whisperModelDownloadUrl(input.model);
  const target = NodePath.join(input.targetDir, fileName!);
  const partial = `${target}.part`;
  const fail = (reason: string, cause?: unknown) =>
    new WhisperModelDownloadError(
      `No whisper model "${input.model}" was found on this computer and downloading it from ${url} failed: ${reason}. Set voice.transcriber.modelPath to an existing ggml .bin file, or check the network connection.`,
      cause === undefined ? undefined : { cause },
    );

  try {
    NodeFS.mkdirSync(input.targetDir, { recursive: true });
    const response = await (input.fetchImpl ?? fetch)(url, { signal: input.signal ?? null });
    if (!response.ok || !response.body) throw fail(`HTTP ${response.status}`);
    const expected = Number(response.headers.get("content-length") ?? 0);
    await NodeStreamPromises.pipeline(
      NodeStream.Readable.from(response.body),
      makeProgressTap(expected > 0 ? expected : null, input.onProgress ?? (() => undefined)),
      NodeFS.createWriteStream(partial),
    );
    const received = NodeFS.statSync(partial).size;
    if (expected > 0 && received !== expected) {
      throw fail(`received ${received} of ${expected} bytes`);
    }
    NodeFS.renameSync(partial, target);
    return target;
  } catch (cause) {
    NodeFS.rmSync(partial, { force: true });
    throw cause instanceof WhisperModelDownloadError
      ? cause
      : fail(cause instanceof Error ? cause.message : "unknown error", cause);
  }
}
