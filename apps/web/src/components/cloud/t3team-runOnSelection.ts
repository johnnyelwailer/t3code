/**
 * Which cloud session "Run on" has selected, as one state machine: a pick takes the selection at
 * once and every later answer (the run id, a phase, a failure) lands on that same entry. One
 * logical session per thread, and a failure that never reverts to the session picked before it.
 *
 * @module t3team-runOnSelection
 */
import type { CloudSession, CloudSessionPhase } from "@t3tools/contracts";

import { CLOUD_SESSION_CREATING_ID } from "~/cloud/t3team-cloudSessionTargetLogic";
import { presentCloudSession } from "./t3team-cloudSessionProvisionPresentation";

/** What the entry is called from the pick until the server names the machine. */
export const NEW_CLOUD_SESSION_LABEL = "New cloud session";

/** The committed part of the selection: what survives thread navigation. */
export interface RunOnSelectionTarget {
  /** `CLOUD_SESSION_CREATING_ID` until the create answers with the run's id. */
  readonly sessionId: string;
  readonly label: string;
  /** The composer's logical project when the session was picked or created. */
  readonly projectKey: string | null;
  /** The create never reached a session id; the entry stays selected and offers Retry. */
  readonly createFailed: boolean;
  /**
   * The just-created session this window already held when the create began: an earlier create's,
   * so it is never the answer to this one.
   */
  readonly staleLocalSessionId?: string | null;
}

export type RunOnSelectionEvent =
  | {
      readonly kind: "create";
      readonly label: string;
      readonly projectKey: string | null;
      readonly staleLocalSessionId?: string | null;
    }
  | { readonly kind: "created"; readonly sessionId: string; readonly label: string }
  | { readonly kind: "createFailed" }
  | {
      readonly kind: "pick";
      readonly sessionId: string;
      readonly label: string;
      readonly projectKey: string | null;
    }
  | { readonly kind: "clear" };

export function reduceRunOnSelection(
  state: RunOnSelectionTarget | null,
  event: RunOnSelectionEvent,
): RunOnSelectionTarget | null {
  switch (event.kind) {
    case "create":
      return {
        sessionId: CLOUD_SESSION_CREATING_ID,
        label: event.label,
        projectKey: event.projectKey,
        createFailed: false,
        staleLocalSessionId: event.staleLocalSessionId ?? null,
      };
    case "created":
      // The answer belongs to the create this entry is waiting for. Once the selection has moved
      // on, or the session is an earlier create's, it must not drag the selection back.
      return state === null ||
        state.sessionId !== CLOUD_SESSION_CREATING_ID ||
        event.sessionId === state.staleLocalSessionId
        ? state
        : {
            sessionId: event.sessionId,
            label: event.label,
            projectKey: state.projectKey,
            createFailed: false,
          };
    case "createFailed":
      return state === null || state.sessionId !== CLOUD_SESSION_CREATING_ID
        ? state
        : { ...state, createFailed: true };
    case "pick":
      return {
        sessionId: event.sessionId,
        label: event.label,
        projectKey: event.projectKey,
        createFailed: false,
      };
    case "clear":
      return null;
  }
}

/**
 * How the selected entry reads. `requesting` and `createFailed` belong to a selection with no
 * session of its own yet; the rest follow the selected session's phase.
 */
export type RunOnSelectionStatus =
  | "requesting"
  | "provisioning"
  | "ready"
  | "createFailed"
  | "shutDown";

/** `phase` is null while the session list has not caught up with the selected session. */
export function runOnSelectionStatus(
  selection: RunOnSelectionTarget,
  phase: CloudSessionPhase | null,
): RunOnSelectionStatus {
  if (selection.sessionId === CLOUD_SESSION_CREATING_ID) {
    return selection.createFailed ? "createFailed" : "requesting";
  }
  switch (phase) {
    case "ready":
      return "ready";
    case "failed":
    case "stopped":
    case "cancelled":
      return "shutDown";
    default:
      return "provisioning";
  }
}

/** A machine that is gone reads the same whether it failed, stopped or was cancelled. */
const SHUT_DOWN = "Shut down";

export interface RunOnSelectionWords {
  readonly title: string;
  readonly detail: string | null;
  /** The entry offers "Retry", which starts another session in its place. */
  readonly retry: boolean;
}

/**
 * The words the selected entry reads while it has no session row of its own. A machine that never
 * arrived reads as one that is gone: what the user can act on is "start another", so the entry
 * says that and nothing about the step that broke.
 */
export function presentRunOnSelection(status: RunOnSelectionStatus): RunOnSelectionWords {
  switch (status) {
    case "requesting":
    case "provisioning":
      return { title: "Getting a machine ready", detail: null, retry: false };
    case "ready":
      return { title: "Ready", detail: null, retry: false };
    case "createFailed":
      return { title: SHUT_DOWN, detail: "it did not start", retry: true };
    case "shutDown":
      return { title: SHUT_DOWN, detail: null, retry: true };
  }
}

/**
 * A Run-on row's one line under the machine name. A failed machine reads as a shut-down one here:
 * the picker is where a machine is chosen, not where a provisioning step is diagnosed (the
 * settings panel keeps the reason).
 */
export function runOnCloudRowDetail(session: CloudSession): string {
  if (session.phase === "failed") return SHUT_DOWN;
  const presentation = presentCloudSession(session);
  return `${presentation.title} · ${presentation.detail}`;
}
