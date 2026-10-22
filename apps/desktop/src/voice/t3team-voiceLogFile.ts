// @effect-diagnostics nodeBuiltinImport:off -- The voice log is written from plain-Node voice code outside any Effect runtime.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;

export type VoiceLogFile = {
  readonly write: (line: string) => void;
  /** Resolves once every line written so far is on disk (tests). */
  readonly flushed: () => Promise<void>;
};

/**
 * Append-only, size-rotated text log for the voice pipeline's timing lines (`voice.log`,
 * `voice.log.1`, …). Callers must only ever hand it timings, devices, model paths and counts:
 * never audio and never transcript text. Writes are queued so a log line never blocks the main
 * process, and a failing disk only drops lines.
 */
export function makeVoiceLogFile(input: {
  readonly filePath: string;
  readonly maxBytes?: number;
  readonly maxFiles?: number;
}): VoiceLogFile {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  let tail: Promise<void> = Promise.resolve();
  let size: number | null = null;

  const rotate = async () => {
    const fs = NodeFS.promises;
    await fs.rm(`${input.filePath}.${maxFiles}`, { force: true }).catch(() => undefined);
    for (let index = maxFiles - 1; index >= 1; index -= 1) {
      await fs
        .rename(`${input.filePath}.${index}`, `${input.filePath}.${index + 1}`)
        .catch(() => undefined);
    }
    await fs.rename(input.filePath, `${input.filePath}.1`).catch(() => undefined);
    size = 0;
  };

  const append = async (line: string) => {
    const fs = NodeFS.promises;
    if (size === null) {
      await fs.mkdir(NodePath.dirname(input.filePath), { recursive: true });
      size = await fs.stat(input.filePath).then(
        (stat) => stat.size,
        () => 0,
      );
    }
    const bytes = Buffer.byteLength(line);
    if (size > 0 && size + bytes > maxBytes) await rotate();
    await fs.appendFile(input.filePath, line);
    size += bytes;
  };

  return {
    write: (line) => {
      const text = line.endsWith("\n") ? line : `${line}\n`;
      tail = tail.then(() => append(text)).catch(() => undefined);
    },
    flushed: () => tail,
  };
}
