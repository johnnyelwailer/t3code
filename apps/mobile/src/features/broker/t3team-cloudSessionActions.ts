import {
  isCloudSessionProvisionPending,
  presentCloudSession,
} from "@t3tools/client-runtime/state/cloud-sessions";
import type { CloudSession } from "@t3tools/contracts";

export type CloudSessionAction = "cancel" | "startAnother";

export interface CloudSessionActionChoice {
  readonly action: CloudSessionAction;
  readonly label: string;
  readonly destructive: boolean;
}

/** What a tap on a session row offers, in the desktop's words for the same phase. */
export function cloudSessionActions(
  session: CloudSession,
): ReadonlyArray<CloudSessionActionChoice> {
  if (isCloudSessionProvisionPending(session.phase)) {
    return [{ action: "cancel", label: "Cancel", destructive: true }];
  }
  if (session.phase === "ready") {
    return [{ action: "cancel", label: "Stop", destructive: true }];
  }
  const { actionLabel } = presentCloudSession(session);
  return actionLabel === null
    ? []
    : [{ action: "startAnother", label: actionLabel, destructive: false }];
}

/** The row's second line: the phase's title and detail, as the desktop shows them. */
export function cloudSessionRowDetail(session: CloudSession): string {
  const { title, detail } = presentCloudSession(session);
  return detail === "" ? title : `${title} · ${detail}`;
}
