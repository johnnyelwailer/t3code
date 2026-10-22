import { useEffect, useState } from "react";

import { formatVoiceClock, voiceUiElapsedMs } from "./t3team-voiceUiModel";
import { useVoiceView } from "./t3team-voiceView";

const TICK_MS = 100;

/** The recording timer: runs while recording and holds its last value once the recording stopped. */
export function VoiceClock(props: { readonly tenths?: boolean; readonly className?: string }) {
  const snapshot = useVoiceView((view) => view.snapshot);
  const running = snapshot.state === "recording";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <span className={props.className} data-testid="voice-clock">
      {formatVoiceClock(voiceUiElapsedMs(snapshot, running ? now : Date.now()), props.tenths)}
    </span>
  );
}
