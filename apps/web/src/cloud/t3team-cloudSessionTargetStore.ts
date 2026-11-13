/**
 * Optimistic Run-on target for a draft/thread: which cloud session is selected
 * before the VM is Ready/connected. Module-level so navigating threads does not
 * drop the preference. A first message sent meanwhile is persisted on the draft
 * itself (`t3team-cloudQueuedSendStore`), not here.
 */
import { useSyncExternalStore } from "react";

import {
  NEW_CLOUD_SESSION_LABEL,
  reduceRunOnSelection,
  type RunOnSelectionEvent,
  type RunOnSelectionTarget,
} from "~/components/cloud/t3team-runOnSelection";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

/**
 * One scope's selection. The fields and every transition belong to `t3team-runOnSelection`; this
 * store only commits them and tells React.
 */
export type CloudSessionTarget = RunOnSelectionTarget & {
  /** Composer/draft/thread key this preference belongs to. */
  readonly scopeKey: string;
};

const listeners = new Set<() => void>();
/** scopeKey -> target */
let byScope = new Map<string, CloudSessionTarget>();
let snapshot: ReadonlyMap<string, CloudSessionTarget> = byScope;

function emit(): void {
  snapshot = byScope;
  for (const listener of listeners) listener();
}

function commit(next: Map<string, CloudSessionTarget>): void {
  byScope = next;
  emit();
}

function apply(scopeKey: string, event: RunOnSelectionEvent): void {
  const current = byScope.get(scopeKey) ?? null;
  const next = reduceRunOnSelection(current, event);
  if (next === current) return;
  const map = new Map(byScope);
  if (next === null) map.delete(scopeKey);
  else map.set(scopeKey, { scopeKey, ...next });
  commit(map);
}

export function subscribeCloudSessionTargets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCloudSessionTargets(): ReadonlyMap<string, CloudSessionTarget> {
  return snapshot;
}

export function getCloudSessionTarget(scopeKey: string): CloudSessionTarget | null {
  return byScope.get(scopeKey) ?? null;
}

export function selectCloudSessionTarget(input: {
  readonly scopeKey: string;
  readonly sessionId: string;
  readonly label: string;
  readonly projectKey?: string | null;
}): void {
  apply(input.scopeKey, {
    kind: "pick",
    sessionId: input.sessionId,
    label: input.label,
    projectKey: input.projectKey ?? null,
  });
}

/** Immediate preference while create is in flight (no session id yet). */
export function selectCloudSessionCreating(
  scopeKey: string,
  label = NEW_CLOUD_SESSION_LABEL,
  projectKey: string | null = null,
  staleLocalSessionId: string | null = null,
): void {
  apply(scopeKey, { kind: "create", label, projectKey, staleLocalSessionId });
}

/** What a "New cloud session" click asks for; a "Move to" create must not touch the target. */
export interface CloudSessionCreateOptions {
  /** False for a started thread: its composer would otherwise send to the new session. */
  readonly selectAsTarget: boolean;
}

/**
 * Starts a create; a Run-on pick also selects the creating session for `scopeKey` at once,
 * tagged with the composer's `projectKey` so the target follows the composer's project.
 */
export function beginCloudSessionCreate(
  scope: {
    readonly scopeKey: string | null;
    readonly projectKey: string | null;
    /** `getCloudSessionLocal()`'s session id now: an earlier create's, never this one's answer. */
    readonly staleLocalSessionId?: string | null;
  },
  options: CloudSessionCreateOptions | undefined,
  create: () => void,
): void {
  if (scope.scopeKey !== null && options?.selectAsTarget !== false) {
    selectCloudSessionCreating(
      scope.scopeKey,
      undefined,
      scope.projectKey,
      scope.staleLocalSessionId ?? null,
    );
  }
  create();
}

/** Create RPC answered: replace the creating sentinel with the real session, in place. */
export function resolveCloudSessionCreating(
  scopeKey: string,
  sessionId: string,
  label: string,
): void {
  apply(scopeKey, { kind: "created", sessionId, label });
}

/** The create never reached a session: the entry stays selected and offers Retry. */
export function failCloudSessionCreate(scopeKey: string): void {
  apply(scopeKey, { kind: "createFailed" });
}

export function clearCloudSessionTarget(scopeKey: string): void {
  apply(scopeKey, { kind: "clear" });
}

export function useCloudSessionTarget(scopeKey: string | null): CloudSessionTarget | null {
  const targets = useSyncExternalStore(
    subscribeCloudSessionTargets,
    getCloudSessionTargets,
    getCloudSessionTargets,
  );
  if (scopeKey === null) return null;
  return targets.get(scopeKey) ?? null;
}

/** True when any target still needs list polling (its create is in flight). */
export function cloudSessionTargetsNeedListRefresh(
  targets: ReadonlyMap<string, CloudSessionTarget> = getCloudSessionTargets(),
): boolean {
  for (const target of targets.values()) {
    if (target.sessionId === CLOUD_SESSION_CREATING_ID && !target.createFailed) return true;
  }
  return false;
}
