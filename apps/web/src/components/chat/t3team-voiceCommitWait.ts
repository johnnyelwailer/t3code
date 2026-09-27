/**
 * Bounded animation-frame wait for a flushed voice attachment to appear in
 * the composer send refs.
 *
 * Stopping a voice recording commits the audio blob into the zustand draft
 * store on the same tick as the MediaRecorder flush, but the send path
 * reads attachments from refs that are synced in a POST-RENDER effect.
 * Polling the refs for an attachment id that was not present before the
 * stop, one animation frame at a time, bridges that one-render gap without
 * a sleep.
 */
export interface VoiceCommitWaitOptions {
  /** Ids of the attachments currently visible in the send refs. */
  observe: () => readonly string[];
  /** Schedule the next frame's check. Injected so tests can drive frames. */
  nextFrame: (callback: () => void) => void;
  /** Number of frames to wait before giving up. Default 20. */
  maxFrames?: number;
}

/**
 * Resolves `true` once an attachment id not in `preStopIds` appears in
 * `observe()`, or `false` after `maxFrames` with no new attachment. The
 * first observation runs synchronously on the call.
 */
export function waitForVoiceAttachment(
  preStopIds: ReadonlySet<string>,
  { observe, nextFrame, maxFrames = 20 }: VoiceCommitWaitOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    let framesLeft = maxFrames;
    const check = (): void => {
      for (const id of observe()) {
        if (!preStopIds.has(id)) {
          resolve(true);
          return;
        }
      }
      framesLeft -= 1;
      if (framesLeft <= 0) {
        resolve(false);
        return;
      }
      nextFrame(check);
    };
    check();
  });
}
