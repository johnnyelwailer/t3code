import {
  cloudSessionFailureDescription,
  createCloudSessionAtoms,
} from "@t3tools/client-runtime/state/cloud-sessions";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Cloud sessions as a connected environment starts and lists them — the same RPCs the desktop's
 * "Run on" menu uses. The environment holds the GHE sign-in and asks the broker for each grant, so
 * a phone starts a session through one of the user's own machines.
 */
export const cloudSessionEnvironment: ReturnType<typeof createCloudSessionAtoms> =
  createCloudSessionAtoms(connectionAtomRuntime);

export interface CloudSessionListState {
  readonly sessions: ReadonlyArray<CloudSession>;
  readonly loading: boolean;
  /** False when that environment has no provider set up: offer setup, not a button. */
  readonly configured: boolean;
  readonly loadError: string | null;
}

const LOADING: CloudSessionListState = {
  sessions: [],
  loading: true,
  configured: true,
  loadError: null,
};

export const cloudSessionListStateAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get): CloudSessionListState => {
    const result = get(cloudSessionEnvironment.list({ environmentId, input: {} }));
    const value = AsyncResult.value(result);
    if (Option.isNone(value)) {
      return AsyncResult.isFailure(result)
        ? { ...LOADING, loading: false, loadError: cloudSessionFailureDescription(result) }
        : LOADING;
    }
    return {
      sessions: value.value.sessions,
      loading: false,
      configured: value.value.configured,
      loadError: null,
    };
  }).pipe(Atom.withLabel("mobile-cloud-sessions")),
);

export const refreshCloudSessionList = (environmentId: EnvironmentId) =>
  cloudSessionEnvironment.list({ environmentId, input: {} });
