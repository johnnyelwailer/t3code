import { useAtomValue } from "@effect/atom-react";
import { createCloudSessionAtoms } from "@t3tools/client-runtime/state/cloud-sessions";
import type { CloudSession } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

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
}

const NO_ENVIRONMENT: CloudSessionListState = {
  sessions: [],
  loading: false,
  configured: true,
};

const LOADING: CloudSessionListState = { sessions: [], loading: true, configured: true };

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

  const result = get(cloudSessionEnvironment.list({ environmentId, input: {} }));
  const value = AsyncResult.value(result);
  if (Option.isNone(value)) return LOADING;
  return {
    sessions: value.value.sessions,
    loading: false,
    configured: value.value.configured,
  };
}).pipe(Atom.withLabel("web-cloud-sessions"));

export function useCloudSessions(): CloudSessionListState {
  return useAtomValue(cloudSessionListAtom);
}

export function usePrimaryEnvironmentId() {
  return useAtomValue(primaryEnvironmentIdAtom);
}
