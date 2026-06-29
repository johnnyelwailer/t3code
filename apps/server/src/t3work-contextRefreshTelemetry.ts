import * as Effect from "effect/Effect";

const TAG = "t3work.contextRefresh";

export function logRefreshStarted(input: {
  readonly ticketKey: string;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly force: boolean;
  readonly focusKind?: string;
}) {
  return Effect.logInfo(`${TAG} refresh started`, input);
}

export function logRefreshFinished(input: {
  readonly ticketKey: string;
  readonly projectId: string;
  readonly status: "synced" | "already_synced";
  readonly includedCount: number;
  readonly skippedCount: number;
  readonly backgroundJobId?: string;
  readonly backgroundQueued?: number;
  readonly focusKind?: string;
}) {
  return Effect.logInfo(`${TAG} refresh finished`, input);
}

export function logRefreshSuperseded(input: {
  readonly ticketKey: string;
  readonly workspaceRoot: string;
}) {
  return Effect.logDebug(`${TAG} refresh superseded`, input);
}

export function logBackgroundKickoff(input: {
  readonly rootKey: string;
  readonly jobId: string;
  readonly queueDepth: number;
  readonly seedCount: number;
  readonly resumed: boolean;
}) {
  return Effect.logInfo(`${TAG} background expansion`, input);
}

export function logBackgroundBudgetPause(input: {
  readonly rootKey: string;
  readonly reason: "hardStop" | "softPressure";
  readonly queueDepth: number;
  readonly cacheBytes?: number;
  readonly softBudgetBytes?: number;
}) {
  return Effect.logDebug(`${TAG} background paused`, input);
}

export function logBackgroundItemProcessed(input: {
  readonly rootKey: string;
  readonly resourceKey: string;
  readonly depth: number;
  readonly queueDepth: number;
  readonly includedCount: number;
  readonly skippedCount: number;
}) {
  return Effect.logDebug(`${TAG} background item processed`, input);
}

export function logBackgroundCompleted(input: {
  readonly rootKey: string;
  readonly jobId: string;
}) {
  return Effect.logInfo(`${TAG} background completed`, input);
}

export function logBackgroundResume(input: {
  readonly resumedCount: number;
  readonly completedCount: number;
  readonly skippedCount: number;
}) {
  return Effect.logInfo(`${TAG} background resume on startup`, input);
}
