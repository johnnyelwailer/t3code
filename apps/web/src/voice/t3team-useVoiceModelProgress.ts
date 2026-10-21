import { useEffect, useState } from "react";

import { voiceModelProgressPercent } from "./t3team-voiceModelProgress";

/** Download percent while the desktop fetches the whisper model; null when idle or the size is unknown. */
export function useVoiceModelProgressPercent(active: boolean): number | null {
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
    if (!active || !bridge?.onVoiceModelProgress) return;
    const unsubscribe = bridge.onVoiceModelProgress((progress) =>
      setPercent(voiceModelProgressPercent(progress)),
    );
    return () => {
      unsubscribe();
      setPercent(null);
    };
  }, [active]);

  return percent;
}
