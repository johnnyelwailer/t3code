// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node helper owned by the whisper host.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";

/** Silero VAD for whisper.cpp, ~0.9 MB: small enough to fetch the first time a recording starts. */
export const SILERO_VAD_FILE_NAME = "ggml-silero-v5.1.2.bin";
const SILERO_VAD_URL = `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${SILERO_VAD_FILE_NAME}`;
const MIN_VAD_MODEL_BYTES = 200_000;

const sizeOf = (filePath: string): number => {
  try {
    return NodeFS.statSync(filePath).size;
  } catch {
    return 0;
  }
};

export function locateSileroVadModel(searchDirs: readonly string[]): string | null {
  for (const dir of searchDirs) {
    const candidate = NodePath.join(dir, SILERO_VAD_FILE_NAME);
    if (sizeOf(candidate) >= MIN_VAD_MODEL_BYTES) return candidate;
  }
  return null;
}

/** Fetches the VAD model into `targetDir`; a failure leaves no partial file and rejects. */
export async function downloadSileroVadModel(input: {
  readonly targetDir: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<string> {
  const target = NodePath.join(input.targetDir, SILERO_VAD_FILE_NAME);
  const partial = `${target}.part`;
  try {
    NodeFS.mkdirSync(input.targetDir, { recursive: true });
    const response = await (input.fetchImpl ?? fetch)(SILERO_VAD_URL);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await NodeStreamPromises.pipeline(
      NodeStream.Readable.from(response.body),
      NodeFS.createWriteStream(partial),
    );
    if (sizeOf(partial) < MIN_VAD_MODEL_BYTES) throw new Error("truncated download");
    NodeFS.renameSync(partial, target);
    return target;
  } catch (error) {
    NodeFS.rmSync(partial, { force: true });
    throw error;
  }
}
