/**
 * Optimistic Run-on target for a draft/thread: which cloud session is selected
 * before the VM is Ready/connected. Module-level so navigating threads does not
 * drop the preference. A first message sent meanwhile is persisted on the draft
 * itself (`t3team-cloudQueuedSendStore`), not here.
 */
import { useSyncExternalStore } from "react";

import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

export interface CloudSessionTarget {
  /** Composer/draft/thread key this preference belongs to. */
  readonly scopeKey: string;
  /**
   * Session id once create returned; `CLOUD_SESSION_CREATING_ID` while the
   * create RPC is still in flight so the trigger can flip off "This computer".
   */
  readonly sessionId: string;
  readonly label: string;
  /**
   * The composer's logical project when the session was picked or created (it is provisioned
   * for that project). Null when the composer had none; then the target follows no project.
   */
  readonly projectKey: string | null;
}

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
  const next = new Map(byScope);
  next.set(input.scopeKey, {
    scopeKey: input.scopeKey,
    sessionId: input.sessionId,
    label: input.label,
    projectKey: input.projectKey ?? null,
  });
  commit(next);
}

/** Immediate preference while create is in flight (no session id yet). */
export function selectCloudSessionCreating(
  scopeKey: string,
  label = "New cloud session",
  projectKey: string | null = null,
): void {
  selectCloudSessionTarget({
    scopeKey,
    sessionId: CLOUD_SESSION_CREATING_ID,
    label,
    projectKey,
  });
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
  scope: { readonly scopeKey: string | null; readonly projectKey: string | null },
  options: CloudSessionCreateOptions | undefined,
  create: () => void,
): void {
  if (scope.scopeKey !== null && options?.selectAsTarget !== false) {
    selectCloudSessionCreating(scope.scopeKey, undefined, scope.projectKey);
  }
  create();
}

/** Create RPC answered: replace the creating sentinel with the real session. */
export function resolveCloudSessionCreating(
  scopeKey: string,
  sessionId: string,
  label: string,
): void {
  const current = byScope.get(scopeKey);
  if (current === undefined || current.sessionId !== CLOUD_SESSION_CREATING_ID) return;
  selectCloudSessionTarget({ scopeKey, sessionId, label, projectKey: current.projectKey });
}

export function clearCloudSessionTarget(scopeKey: string): void {
  if (!byScope.has(scopeKey)) return;
  const next = new Map(byScope);
  next.delete(scopeKey);
  commit(next);
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
    if (target.sessionId === CLOUD_SESSION_CREATING_ID) return true;
  }
  return false;
}
