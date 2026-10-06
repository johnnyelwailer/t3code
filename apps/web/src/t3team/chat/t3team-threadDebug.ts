import type { ThreadShell } from "~/types";

const DEFAULT_MAX_T3TEAM_THREAD_DEBUG_EVENTS = 500;

export type T3TeamThreadDebugEvent = {
  at: string;
  name: string;
  payload: Record<string, unknown>;
};

declare global {
  var __T3TEAM_THREAD_DEBUG_EVENTS__: T3TeamThreadDebugEvent[] | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPrimitive(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return value === null ? null : String(value);
}

export function appendT3TeamThreadDebugEvent(
  events: ReadonlyArray<T3TeamThreadDebugEvent>,
  event: T3TeamThreadDebugEvent,
  maxEvents = DEFAULT_MAX_T3TEAM_THREAD_DEBUG_EVENTS,
): T3TeamThreadDebugEvent[] {
  const nextEvents = [...events, event];
  return nextEvents.length <= maxEvents
    ? nextEvents
    : nextEvents.slice(nextEvents.length - maxEvents);
}

export function summarizeT3TeamThreadEvent(event: unknown): Record<string, unknown> {
  if (!isRecord(event)) {
    return { value: asPrimitive(event) };
  }

  const summary: Record<string, unknown> = {};

  for (const key of [
    "type",
    "_tag",
    "threadId",
    "projectId",
    "turnId",
    "messageId",
    "commandId",
    "sessionId",
    "status",
    "reason",
    "channel",
  ]) {
    const value = event[key];
    if (value !== undefined) {
      summary[key] = asPrimitive(value);
    }
  }

  if (summary.type === undefined && summary._tag === undefined) {
    summary.keys = Object.keys(event).slice(0, 8);
  }

  return summary;
}

/** A compact debug summary of a live thread shell (any subset of it). */
export function summarizeT3TeamServerThread(
  thread: Partial<ThreadShell> | null | undefined,
): Record<string, unknown> | null {
  if (!thread) {
    return null;
  }
  return {
    id: thread.id ?? null,
    projectId: thread.projectId ?? null,
    title: thread.title ?? null,
    visibleItemCount: thread.visibleItemCount ?? null,
    latestRunId: thread.latestRun?.runId ?? null,
    runtimeStatus: thread.runtime?.status ?? null,
    archivedAt: thread.archivedAt ?? null,
    error: thread.runtime?.lastError ?? null,
  };
}

function isVerboseConsoleEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem("t3team:thread-debug") === "1";
  } catch {
    return false;
  }
}

export function recordT3TeamThreadDebug(name: string, payload: Record<string, unknown> = {}): void {
  const nextEvent: T3TeamThreadDebugEvent = {
    at: new Date().toISOString(),
    name,
    payload,
  };

  const currentEvents = Array.isArray(globalThis.__T3TEAM_THREAD_DEBUG_EVENTS__)
    ? globalThis.__T3TEAM_THREAD_DEBUG_EVENTS__
    : [];

  globalThis.__T3TEAM_THREAD_DEBUG_EVENTS__ = appendT3TeamThreadDebugEvent(
    currentEvents,
    nextEvent,
  );

  if (isVerboseConsoleEnabled()) {
    console.debug("[t3team-thread]", name, payload);
  }
}
