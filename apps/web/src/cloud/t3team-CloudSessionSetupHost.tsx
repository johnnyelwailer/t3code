/**
 * Mounts the setup card for a thread and retires it: a session that is already ready when the
 * thread opens shows nothing (an old draft must not flash "ready"), and one that becomes ready
 * while the card is on screen says so for a moment and then goes. The card dissolves with a CSS
 * animation timed to `CLOUD_SETUP_READY_LINGER_MS`; this unmounts it after, so it takes no space.
 */
import { useEffect, useState } from "react";

import {
  CloudSessionSetupCard,
  type CloudSessionSetupCardProps,
} from "./t3team-CloudSessionSetupCard";
import { buildCloudSessionSetup } from "./t3team-cloudSessionSetupProgress";

/** Matches the delay + duration of `t3team-setup-leave` in t3team-index-setupProgress.css. */
export const CLOUD_SETUP_READY_LINGER_MS = 2_800;

export function CloudSessionSetupHost(props: CloudSessionSetupCardProps) {
  const { session } = props.facts;
  const stage = buildCloudSessionSetup(props.facts).stage;
  const sessionId = session?.sessionId ?? null;
  const [retired, setRetired] = useState<string | null>(stage === "ready" ? sessionId : null);
  useEffect(() => {
    if (stage !== "ready" || sessionId === null) return;
    const id = setTimeout(() => setRetired(sessionId), CLOUD_SETUP_READY_LINGER_MS);
    return () => clearTimeout(id);
  }, [stage, sessionId]);
  if (sessionId !== null && retired === sessionId) return null;
  return <CloudSessionSetupCard {...props} />;
}
