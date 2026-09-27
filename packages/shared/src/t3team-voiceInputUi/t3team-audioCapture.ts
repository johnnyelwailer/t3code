/**
 * Raw audio capture for voice input: records a live mic stream with
 * MediaRecorder and resolves the finished blob on stop.
 *
 * Independent of Web Speech — works wherever getUserMedia + MediaRecorder
 * work (including Electron, where the STT backend is unreachable).
 */

/** One finished voice recording. */
export interface RecordedVoiceAudio {
  blob: Blob;
  mimeType: string;
  /** Approximate recorded duration in ms (start-to-stop clock). */
  durationMs: number;
}

/** Live capture handle for one recording session. */
export interface AudioCaptureHandle {
  /** Stop and resolve the finished recording; null when no audio was captured. */
  stop: () => Promise<RecordedVoiceAudio | null>;
  /** True once the recorder has emitted its first non-empty chunk. */
  hasAudio: () => boolean;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

/** Guards every browser-global access so this module is SSR-safe. */
const hasMediaRecorder = (): boolean =>
  typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined";

/** Pick the best supported recording mime type, or null when unsupported. */
export function pickVoiceMime(): string | null {
  if (!hasMediaRecorder()) return null;
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* older engines */
    }
  }
  return null;
}

/**
 * Start capturing `stream` immediately. The recorder timeslices every 250 ms
 * so bytes flow during the recording; `stop()` flushes and resolves the full
 * blob (or null when nothing was recorded).
 */
export function startAudioCapture(stream: MediaStream): AudioCaptureHandle | null {
  if (!hasMediaRecorder()) return null;
  const mimeType = pickVoiceMime();
  if (!mimeType) return null;

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  let hasAudio = false;
  let stopped = false;
  let startedAt = 0;
  let waiting: ((recording: RecordedVoiceAudio | null) => void) | null = null;

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
      hasAudio = true;
    }
  };
  recorder.onstop = () => {
    const resolve = waiting;
    waiting = null;
    const recording: RecordedVoiceAudio | null =
      hasAudio && chunks.length > 0
        ? {
            blob: new Blob(chunks, { type: mimeType }),
            mimeType,
            durationMs: Math.max(0, Date.now() - startedAt),
          }
        : null;
    chunks.length = 0;
    resolve?.(recording);
  };

  startedAt = Date.now();
  try {
    recorder.start(250);
  } catch {
    /* already started or stream gone — stop() will report no audio */
  }

  return {
    hasAudio: () => hasAudio,
    stop: () =>
      new Promise<RecordedVoiceAudio | null>((resolve) => {
        if (stopped) {
          resolve(null);
          return;
        }
        stopped = true;
        waiting = resolve;
        if (recorder.state === "inactive") {
          resolve(null);
          waiting = null;
          return;
        }
        try {
          recorder.stop();
        } catch {
          resolve(null);
          waiting = null;
        }
        // onstop is guaranteed after stop() in real engines; the timer is a
        // belt-and-braces bound so a stuck recorder never hangs the commit.
        window.setTimeout(() => {
          if (waiting === null) return;
          waiting = null;
          resolve(null);
        }, 1500);
      }),
  };
}
