/**
 * Mounts the setup card for a thread and retires it. "Ready" is only said about a session this card
 * watched being set up: a session that is ready the first time the card knows its phase (an old
 * draft, however late its session list arrives) shows nothing. One that becomes ready on screen
 * says so for a moment and then goes. The card dissolves with a CSS animation timed to
 * `CLOUD_SETUP_READY_LINGER_MS`; this unmounts it after, so it takes no space.
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
  const [watched, setWatched] = useState<string | null>(null);
  const [retired, setRetired] = useState<string | null>(null);
  if (stage === "working" && sessionId !== null && watched !== sessionId) setWatched(sessionId);
  const announcing = stage === "ready" && sessionId !== null && watched === sessionId;
  useEffect(() => {
    if (!announcing || sessionId === null) return;
    const id = setTimeout(() => setRetired(sessionId), CLOUD_SETUP_READY_LINGER_MS);
    return () => clearTimeout(id);
  }, [announcing, sessionId]);
  if (stage === "ready" && (!announcing || retired === sessionId)) return null;
  return <CloudSessionSetupCard {...props} />;
}
