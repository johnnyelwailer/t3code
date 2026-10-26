/**
 * One live recording per app. Every composer voice input claims the slot when
 * it starts; a claim made while another is held stops the holder first, so two
 * recognizers (and two open microphones) can never run side by side. The
 * newer start wins because the user's latest tap is the intent.
 */
interface RecordingClaim {
  readonly stop: () => void;
}

let activeClaim: RecordingClaim | null = null;

/**
 * Take the single recording slot, stopping the current holder. `stop` must end
 * the recording and call the returned release. Returns the release function.
 */
export function claimActiveRecording(stop: () => void): () => void {
  const previous = activeClaim;
  const claim: RecordingClaim = { stop };
  activeClaim = claim;
  previous?.stop();
  return () => {
    if (activeClaim === claim) activeClaim = null;
  };
}
