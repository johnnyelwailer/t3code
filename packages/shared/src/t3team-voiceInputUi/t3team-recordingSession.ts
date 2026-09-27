/**
 * Recognition-session wiring for one recording: builds the
 * VoiceRecognitionSession with the hook's transcript and error callbacks.
 * Split out of t3team-useVoiceInput.ts to keep it under the additive
 * guard's 200 non-empty line ceiling.
 */
import { VoiceRecognitionSession } from "./t3team-recognition.ts";

export interface RecordingSessionDeps {
  /** Live transcript accumulator (final chunks are appended in place). */
  accumulatedRef: { current: string };
  onPartialTranscript?: ((text: string) => void) | undefined;
  onPermissionDenied: () => void;
  onOtherError: () => void;
  onStartFailed: () => void;
}

/**
 * Create the continuous recognition stream for a recording.
 *
 * Final chunks arrive word-by-word without separators, so they are joined
 * with a single space ("hallo" + "welt" reads "hallo welt").
 */
export function createRecordingSession(
  language: string,
  deps: RecordingSessionDeps,
): VoiceRecognitionSession {
  return new VoiceRecognitionSession(language, {
    onFinalChunk: (chunk) => {
      deps.accumulatedRef.current = deps.accumulatedRef.current
        ? `${deps.accumulatedRef.current} ${chunk}`
        : chunk;
      deps.onPartialTranscript?.(deps.accumulatedRef.current);
    },
    onPermissionDenied: deps.onPermissionDenied,
    onOtherError: deps.onOtherError,
    onStartFailed: deps.onStartFailed,
  });
}
