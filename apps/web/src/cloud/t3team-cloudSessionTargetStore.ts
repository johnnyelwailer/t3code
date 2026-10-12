/**
 * Optimistic Run-on target for a draft/thread: which cloud session is selected
 * before the VM is Ready/connected, and the first message queued until bind.
 * Module-level so navigating threads does not drop the preference or the queue.
 */
import { useSyncExternalStore } from "react";

import {
  CLOUD_SESSION_CREATING_ID,
  cloudSessionSelectValue,
} from "./t3team-cloudSessionTargetLogic";

export interface CloudSessionQueuedSend {
  readonly messageId: string;
  readonly messageText: string;
  readonly createdAt: string;
}

export interface CloudSessionTarget {
  /** Composer/draft/thread key this preference belongs to. */
  readonly scopeKey: string;
  /**
   * Session id once create returned; `CLOUD_SESSION_CREATING_ID` while the
   * create RPC is still in flight so the trigger can flip off "This computer".
   */
  readonly sessionId: string;
  readonly label: string;
  /** True after the user sends; connect/flush run only then. */
  readonly bindRequested: boolean;
  readonly queuedSend: CloudSessionQueuedSend | null;
  readonly failureMessage: string | null;
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
}): void {
  const next = new Map(byScope);
  const previous = next.get(input.scopeKey);
  next.set(input.scopeKey, {
    scopeKey: input.scopeKey,
    sessionId: input.sessionId,
    label: input.label,
    bindRequested: previous?.bindRequested === true && previous.sessionId === input.sessionId,
    queuedSend: previous?.sessionId === input.sessionId ? (previous.queuedSend ?? null) : null,
    failureMessage: null,
  });
  commit(next);
}

/** Immediate preference while create is in flight (no session id yet). */
export function selectCloudSessionCreating(scopeKey: string, label = "New cloud session"): void {
  selectCloudSessionTarget({
    scopeKey,
    sessionId: CLOUD_SESSION_CREATING_ID,
    label,
  });
}

/** Create RPC answered: replace the creating sentinel with the real session. */
export function resolveCloudSessionCreating(
  scopeKey: string,
  sessionId: string,
  label: string,
): void {
  const current = byScope.get(scopeKey);
  if (current === undefined || current.sessionId !== CLOUD_SESSION_CREATING_ID) return;
  selectCloudSessionTarget({ scopeKey, sessionId, label });
}

export function clearCloudSessionTarget(scopeKey: string): void {
  if (!byScope.has(scopeKey)) return;
  const next = new Map(byScope);
  next.delete(scopeKey);
  commit(next);
}

export function requestCloudSessionBind(
  scopeKey: string,
  queuedSend: CloudSessionQueuedSend,
): boolean {
  const current = byScope.get(scopeKey);
  if (current === undefined) return false;
  const next = new Map(byScope);
  next.set(scopeKey, {
    ...current,
    bindRequested: true,
    queuedSend,
    failureMessage: null,
  });
  commit(next);
  return true;
}

export function clearCloudSessionQueuedSend(scopeKey: string): CloudSessionQueuedSend | null {
  const current = byScope.get(scopeKey);
  if (current === undefined || current.queuedSend === null) return null;
  const queued = current.queuedSend;
  const next = new Map(byScope);
  next.set(scopeKey, { ...current, bindRequested: false, queuedSend: null, failureMessage: null });
  commit(next);
  return queued;
}

export function failCloudSessionBind(
  scopeKey: string,
  message: string,
): CloudSessionQueuedSend | null {
  const current = byScope.get(scopeKey);
  if (current === undefined) return null;
  const queued = current.queuedSend;
  const next = new Map(byScope);
  next.set(scopeKey, {
    ...current,
    bindRequested: false,
    queuedSend: null,
    failureMessage: message,
  });
  commit(next);
  return queued;
}

export function cloudSessionTargetSelectValue(target: CloudSessionTarget | null): string | null {
  return target === null ? null : cloudSessionSelectValue(target.sessionId);
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

/** True when any target still needs list polling (creating or bind in flight). */
export function cloudSessionTargetsNeedListRefresh(
  targets: ReadonlyMap<string, CloudSessionTarget> = getCloudSessionTargets(),
): boolean {
  for (const target of targets.values()) {
    if (target.sessionId === CLOUD_SESSION_CREATING_ID || target.bindRequested) return true;
  }
  return false;
}
