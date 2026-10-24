import type { EnvironmentId } from "@t3tools/contracts";
import { CloudOffIcon } from "lucide-react";

import { ENDED_SESSION_BANNER_COPY } from "~/cloud/t3team-endedSessionAction";
import { useEnvironmentSessionEnded } from "~/cloud/t3team-useEnvironmentLiveState";

import { CloudSessionEndedActions } from "../cloud/t3team-CloudSessionEndedActions";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

const UNAVAILABLE_BANNER_PREFIX = "environment-unavailable:";

/**
 * The composer banner for a thread whose cloud session has ended: the connection was parked on
 * `session_ended`, so "reconnecting" would be a lie and retrying is pointless. Null otherwise.
 */
export function useCloudSessionEndedBannerItem(
  environmentId: EnvironmentId | null,
): ComposerBannerStackItem | null {
  const ended = useEnvironmentSessionEnded(environmentId);
  if (!ended || environmentId === null) return null;
  return {
    id: `cloud-session-ended:${environmentId}`,
    variant: "warning",
    icon: <CloudOffIcon aria-hidden="true" />,
    title: ENDED_SESSION_BANNER_COPY.title,
    description: ENDED_SESSION_BANNER_COPY.description,
    actions: <CloudSessionEndedActions environmentId={environmentId} />,
  };
}

/**
 * Adds the ended banner to the composer's system banners and drops the generic "<env> is
 * offline" one it replaces. The composer stays gated by the environment being unavailable.
 */
export function withCloudSessionEndedBanner(
  items: ReadonlyArray<ComposerBannerStackItem>,
  ended: ComposerBannerStackItem | null,
): ComposerBannerStackItem[] {
  if (ended === null) return [...items];
  return [...items.filter((item) => !item.id.startsWith(UNAVAILABLE_BANNER_PREFIX)), ended];
}
