/**
 * Where a committed utterance goes while the voice thread's composer is on screen: straight into
 * its draft, as typed text the user reviews and sends. Without a mounted composer the utterance
 * takes the hands-free route to the voice thread instead (`useVoiceCommit`).
 */
export type VoiceDraftSink = (text: string) => void;

let sink: VoiceDraftSink | null = null;

/** Registers the composer's sink; the returned function unregisters exactly this one. */
export function setVoiceDraftSink(next: VoiceDraftSink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

/** True when a composer took the text. */
export function deliverToVoiceDraft(text: string): boolean {
  if (sink === null) return false;
  sink(text);
  return true;
}
