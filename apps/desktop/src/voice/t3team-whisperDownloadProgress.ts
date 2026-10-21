// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node helper owned by the whisper model download.
import * as NodeStream from "node:stream";

import type { DesktopVoiceModelProgress } from "@t3tools/contracts";

/** Without a content length there is no percent to step on; report in coarse byte steps instead. */
const UNKNOWN_TOTAL_STEP_BYTES = 8 * 1024 * 1024;
const PERCENT_STEPS = 100;

export type DownloadProgressListener = (progress: DesktopVoiceModelProgress) => void;

/** A pass-through stream that reports received bytes at ~1% steps, so a 1.6 GB download stays cheap to observe. */
export function makeProgressTap(
  totalBytes: number | null,
  onProgress: DownloadProgressListener,
): NodeStream.Transform {
  const step = totalBytes
    ? Math.max(1, Math.floor(totalBytes / PERCENT_STEPS))
    : UNKNOWN_TOTAL_STEP_BYTES;
  let received = 0;
  let reportedAt = 0;
  return new NodeStream.Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received - reportedAt >= step) {
        reportedAt = received;
        onProgress({ receivedBytes: received, totalBytes });
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (received !== reportedAt) onProgress({ receivedBytes: received, totalBytes });
      callback();
    },
  });
}
