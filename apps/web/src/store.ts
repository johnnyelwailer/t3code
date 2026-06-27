/**
 * Compatibility shim for t3work — bridges legacy zustand selectors to atom-based state.
 * New code should use hooks from ~/state/entities directly.
 */
import { useAtomValue } from "@effect/atom-react";
import { mergeEnvironmentThread } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import { appAtomRegistry } from "./rpc/atomRegistry";
import { environmentProjects } from "./state/projects";
import { environmentThreadDetails, environmentThreadShells } from "./state/threads";
import type { Project, Thread } from "./types";

export interface AppState {
  readonly activeEnvironmentId: EnvironmentId | null;
}

const EMPTY_APP_STATE: AppState = { activeEnvironmentId: null };

const threadSelectorRefByIdentity = new WeakMap<
  (state: AppState) => unknown,
  ScopedThreadRef | null
>();

export function registerThreadSelectorRef(
  selector: (state: AppState) => unknown,
  ref: ScopedThreadRef | null,
): void {
  threadSelectorRefByIdentity.set(selector, ref);
}

export function selectProjectsAcrossEnvironments(_state: AppState): Project[] {
  return [...appAtomRegistry.get(environmentProjects.projectsAtom)];
}

export function selectThreadsAcrossEnvironments(_state: AppState): Thread[] {
  const refs = appAtomRegistry.get(environmentThreadShells.threadRefsAtom);
  return refs.flatMap((ref) => {
    const shell = appAtomRegistry.get(environmentThreadShells.threadShellAtom(ref));
    const detail = appAtomRegistry.get(environmentThreadDetails.detailAtom(ref));
    const thread = mergeEnvironmentThread(detail, shell);
    return thread ? [thread] : [];
  });
}

export function useStore<T>(selector: (state: AppState) => T): T {
  useAtomValue(environmentProjects.projectsAtom);
  useAtomValue(environmentThreadShells.threadRefsAtom);

  const threadRef = threadSelectorRefByIdentity.get(selector) ?? null;
  if (threadRef) {
    useAtomValue(environmentThreadShells.threadShellAtom(threadRef));
    useAtomValue(environmentThreadDetails.detailAtom(threadRef));
  }

  return useMemo(() => selector(EMPTY_APP_STATE), [selector]);
}
