import { useEffect, useState } from "react";

/** `Preparing…` that counts seconds from the moment it appears, for a wait with no progress to report. */
export function VoiceElapsedLabel(props: { readonly label: string; readonly className?: string }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = Math.floor((now - startedAt) / 1000);
  return (
    <span className={props.className} data-testid="voice-elapsed">
      {seconds < 1 ? `${props.label}…` : `${props.label}… ${seconds} s`}
    </span>
  );
}
