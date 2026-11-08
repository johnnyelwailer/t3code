import { useEffect, useRef } from "react";

import { VoiceProgress } from "./surface/t3team-VoiceRowParts";
import { useVoiceSessionNote } from "./surface/t3team-useVoiceSessionNote";
import { VOICE_WARMING_LABEL } from "./surface/t3team-voiceSessionNote";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { setVoiceDraftSink } from "./t3team-voiceDraftSink";
import { useIsVoiceThread } from "./t3team-useIsVoiceThread";

/**
 * Dictation in the voice thread's composer. Every committed utterance is appended to the draft as
 * typed text (`onDictated`), and the utterance still being spoken trails it in the draft as muted
 * ghost text at the append position (`onPartial`); nothing else: no card, border, fill, tint,
 * timer or second stop. The mic is the one control. While the speech model warms up it says so
 * inline; the mic records meanwhile and nothing said is lost.
 */
export function VoiceComposerInline(props: {
  readonly environmentId: string;
  readonly threadId: string | null;
  readonly onDictated: (text: string) => void;
  /** The live utterance, as muted ghost text at the end of the draft; "" clears it. */
  readonly onPartial: (text: string) => void;
}) {
  const isVoiceThread = useIsVoiceThread(props.environmentId, props.threadId);
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const partial = useVoiceUiStore((store) => store.live.partial);
  const { note } = useVoiceSessionNote();
  const onDictatedRef = useRef(props.onDictated);
  const onPartialRef = useRef(props.onPartial);
  useEffect(() => {
    onDictatedRef.current = props.onDictated;
    onPartialRef.current = props.onPartial;
  });
  useEffect(() => {
    if (!isVoiceThread) return;
    return setVoiceDraftSink((text) => onDictatedRef.current(text));
  }, [isVoiceThread]);
  const live = state === "recording" || state === "transcribing";
  const ghostText = isVoiceThread && live && partial !== "" ? partial : "";
  useEffect(() => {
    onPartialRef.current(ghostText);
  }, [ghostText]);
  const warming = note.kind === "warming";
  if (!isVoiceThread || !warming) return null;
  return (
    <div
      data-testid="voice-composer-inline"
      data-state={state}
      role="status"
      aria-live="polite"
      className="min-w-0 whitespace-pre-wrap break-words px-0.5 pb-1 text-sm text-muted-foreground/60 italic"
    >
      {VOICE_WARMING_LABEL}
      <span className="ms-2 inline-block w-16 align-middle not-italic">
        <VoiceProgress label="Warming up the speech model" percent={note.percent} />
      </span>
    </div>
  );
}
