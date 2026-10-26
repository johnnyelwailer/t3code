import { useAtomValue } from "@effect/atom-react";
import { createCloudSessionAtoms } from "@t3tools/client-runtime/state/cloud-sessions";
import type { CloudSession, CloudSessionListResult } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { cloudSessionFailureDescription } from "../cloud/t3team-cloudSessionFailureDescription";
import { cloudSessionFailureRetryAt } from "../cloud/t3team-cloudSessionFailureRetryAt";
import { connectionAtomRuntime } from "../connection/runtime";
import { primaryEnvironmentIdAtom } from "./primaryEnvironment";

export const cloudSessionEnvironment: ReturnType<typeof createCloudSessionAtoms> =
  createCloudSessionAtoms(connectionAtomRuntime);

export interface CloudSessionListState {
  readonly sessions: ReadonlyArray<CloudSession>;
  /** True until the first answer arrives, so the panel can show skeletons. */
  readonly loading: boolean;
  /**
   * False when the server has no provider configured. Deliberately distinct
   * from "no sessions": one means offer setup, the other means offer a button.
   */
  readonly configured: boolean;
  /** The provider's full-history page for this user; null when not offered. */
  readonly historyUrl: string | null;
  /** Why the list could not be read, when it never could; null otherwise. */
  readonly loadError: string | null;
  /**
   * When the list failed because the provider paused this host, the earliest
   * wall-clock ms a retry can succeed. Polling backs off until then.
   */
  readonly rateLimitedUntilMs: number | null;
  /**
   * True when the latest refresh failed but an earlier answer is still shown (an effect atom keeps
   * the last success under a failure), so `sessions` may be stale. `loadError` stays null then.
   */
  readonly refreshFailed: boolean;
}

const NO_ENVIRONMENT: CloudSessionListState = {
  sessions: [],
  loading: false,
  configured: true,
  historyUrl: null,
  loadError: null,
  rateLimitedUntilMs: null,
  refreshFailed: false,
};

const LOADING: CloudSessionListState = {
  sessions: [],
  loading: true,
  configured: true,
  historyUrl: null,
  loadError: null,
  rateLimitedUntilMs: null,
  refreshFailed: false,
};

/**
 * The list state for one answer of the list query. A failed refresh keeps the last success
 * (`AsyncResult.value` reads it from the failure's `previousSuccess`), so the old rows are shown
 * with `loadError` null and `refreshFailed` set: they may be stale.
 */
export function cloudSessionListState(
  result: AsyncResult.AsyncResult<CloudSessionListResult, unknown>,
): CloudSessionListState {
  const value = AsyncResult.value(result);
  if (Option.isNone(value)) {
    // A list that failed before it ever loaded must say so; skeletons would wait forever.
    return AsyncResult.isFailure(result)
      ? {
          ...LOADING,
          loading: false,
          loadError: cloudSessionFailureDescription(result),
          rateLimitedUntilMs: cloudSessionFailureRetryAt(result),
        }
      : LOADING;
  }
  return {
    sessions: value.value.sessions,
    loading: false,
    configured: value.value.configured,
    historyUrl: value.value.historyUrl ?? null,
    loadError: null,
    rateLimitedUntilMs: null,
    refreshFailed: AsyncResult.isFailure(result),
  };
}

/**
 * Cloud sessions on the primary environment.
 *
 * Scoped to the primary environment on purpose: a cloud session is provisioned
 * *by* the machine the user drives from, so listing every connected
 * environment's sessions would make "whose machine started this?" ambiguous.
 *
 * Composed as an atom rather than resolved in the hook so the family is only
 * subscribed to when there is actually an environment to ask.
 */
export const cloudSessionListAtom = Atom.make<CloudSessionListState>((get) => {
  const environmentId = get(primaryEnvironmentIdAtom);
  if (environmentId === null) return NO_ENVIRONMENT;

  return cloudSessionListState(get(cloudSessionEnvironment.list({ environmentId, input: {} })));
}).pipe(Atom.withLabel("web-cloud-sessions"));

export function useCloudSessions(): CloudSessionListState {
  return useAtomValue(cloudSessionListAtom);
}

export function usePrimaryEnvironmentId() {
  return useAtomValue(primaryEnvironmentIdAtom);
}
