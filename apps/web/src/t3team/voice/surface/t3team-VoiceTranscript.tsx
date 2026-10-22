import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import {
  advanceTranscriptWords,
  isFreshWord,
  nextSettleAt,
  splitTranscript,
  type TranscriptWord,
} from "./t3team-voiceTranscriptWords";
import "~/t3team/voice/surface/t3team-voice.css";

/**
 * The transcript so far. New words arrive emphasized and settle into the sentence over about a
 * second, words the pipeline changes are corrected in place, and while `live` the last word is
 * dimmed as tentative and a caret blinks after it.
 */
export function VoiceTranscript(props: {
  readonly text: string;
  readonly live: boolean;
  readonly placeholder?: string;
  readonly className?: string;
}) {
  const { text, live, placeholder, className } = props;
  const [words, setWords] = useState<ReadonlyArray<TranscriptWord>>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const arrival = Date.now();
    setWords((previous) => advanceTranscriptWords(previous, splitTranscript(text), arrival));
    setNow(arrival);
  }, [text]);

  useEffect(() => {
    const settleAt = nextSettleAt(words, Date.now());
    if (settleAt === null) return;
    const delay = Math.max(0, settleAt - Date.now()) + 16;
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [words, now]);

  return (
    <p
      className={cn(VOICE_CLASS.transcript, "min-h-[1.5em] leading-normal", className)}
      data-live={live ? "" : undefined}
    >
      {words.length === 0 && placeholder !== undefined ? (
        <span className="text-muted-foreground/70">{placeholder}</span>
      ) : null}
      {words.map((word, index) => (
        <span key={`${index}:${word.revision}`}>
          <span
            className={VOICE_CLASS.word}
            data-fresh={live && isFreshWord(word, now) ? "" : undefined}
            data-tentative={live && index === words.length - 1 ? "" : undefined}
            data-revised={word.revision > 0 ? "" : undefined}
          >
            {word.text}
          </span>{" "}
        </span>
      ))}
      {live ? <span aria-hidden className={VOICE_CLASS.caret} /> : null}
    </p>
  );
}
