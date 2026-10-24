import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import { isCloudSessionProvisionPending } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";

import { liveCloudSessionForEnvironment } from "./t3team-cloudSessionEnvironmentMatch";

/**
 * What the ended-session banner offers. The ended session's workspace keeps its environment id
 * (the snapshot carries it), so the next session serves the same environment: threads already
 * synced stay where they are, and connecting to the new session resumes them.
 *
 * - `start`: nothing is on its way; one click starts another session (the same create the
 *   "Run on" menu and settings use).
 * - `starting`: a create is in flight or a session is still provisioning.
 * - `connect`: a live session already serves this environment (started elsewhere, or just ready).
 */
export type EndedSessionAction =
  | { readonly kind: "start" }
  | { readonly kind: "starting" }
  | { readonly kind: "connect"; readonly session: CloudSession };

export function resolveEndedSessionAction(input: {
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly environmentId: EnvironmentId;
  readonly createPending: boolean;
}): EndedSessionAction {
  const live = liveCloudSessionForEnvironment(input.sessions, input.environmentId);
  if (live !== null && live.phase === "ready") return { kind: "connect", session: live };
  if (input.createPending || input.sessions.some((s) => isCloudSessionProvisionPending(s.phase))) {
    return { kind: "starting" };
  }
  return { kind: "start" };
}

export const ENDED_SESSION_BANNER_COPY = {
  title: "This cloud session has ended",
  description: "Your threads are saved. Start another session to keep working here.",
  start: "Start another cloud session",
  starting: "Starting a cloud session…",
  connect: "Connect to the new session",
} as const;
