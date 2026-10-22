import { useEffect, useState } from "react";

import {
  voiceSessionNote,
  voiceSessionNoteExpiresAt,
  voiceWritingLabel,
  type VoiceSessionNote,
} from "./t3team-voiceSessionNote";
import { useVoiceView } from "./t3team-voiceView";

/**
 * What the recording session is doing, kept current: it re-renders when the note changes by
 * itself (a running count, the end of the heard flash), never once per level event.
 */
export function useVoiceSessionNote(): {
  readonly note: VoiceSessionNote;
  /** `Transcribing… 3 s` while writing, otherwise null. */
  readonly writingLabel: string | null;
} {
  const state = useVoiceView((view) => view.snapshot.state);
  const endedAtMs = useVoiceView((view) => view.snapshot.endedAtMs);
  const writing = useVoiceView((view) => view.live.writing);
  const writingSinceMs = useVoiceView((view) => view.live.writingSinceMs);
  const heard = useVoiceView((view) => view.live.heard);
  const warmup = useVoiceView((view) => view.live.warmup);
  const [now, setNow] = useState(() => Date.now());

  const live = { writing, writingSinceMs, heard, warmup };
  const note = voiceSessionNote({ state, endedAtMs, live, now });
  const expiresAt = voiceSessionNoteExpiresAt(note, live, now);

  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(16, expiresAt - Date.now()) + 16,
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  return {
    note,
    writingLabel: note.kind === "writing" ? voiceWritingLabel(note.sinceMs, now) : null,
  };
}
