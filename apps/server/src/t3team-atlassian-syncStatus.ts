/**
 * The seam between the Jira connection surfaces (Settings card, digest notice) and the mirror
 * sync's persisted state. Both surfaces read through these two functions only.
 *
 * `lastSyncAt` is the last catch-up walk that reached the end of Jira's change list; `lastError`
 * is a plain-language sentence a user can read as is, present only while that failure is newer
 * than the last success. A dead session is never reported here: the account's needs-reconnect
 * flag owns that state, and repeating it as a sync error would outlive the user signing back in.
 */
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { ATLASSIAN_SESSION_EXPIRED_MESSAGE } from "./t3team-atlassian-auth-staleToken.ts";
import {
  readT3TeamMirrorSyncStatus,
  readT3TeamMirrorSyncStatusesForAccount,
  type T3TeamMirrorSyncStatus,
} from "./t3team-atlassian-mirrorSyncState.ts";

export type T3TeamJiraSyncStatus = {
  /** Epoch ms of the last sync that matched Jira; absent before the first one. */
  readonly lastSyncAt?: number;
  readonly lastError?: string;
};

function unresolvedError(state: T3TeamMirrorSyncStatus): string | undefined {
  if (state.lastError === undefined || state.lastErrorAtMs === undefined) return undefined;
  if (state.lastError === ATLASSIAN_SESSION_EXPIRED_MESSAGE) return undefined;
  const newerThanSuccess =
    state.lastSuccessAtMs === undefined || state.lastErrorAtMs > state.lastSuccessAtMs;
  return newerThanSuccess ? state.lastError : undefined;
}

export function toJiraSyncStatus(state: T3TeamMirrorSyncStatus): T3TeamJiraSyncStatus {
  const lastError = unresolvedError(state);
  return {
    ...(state.lastSuccessAtMs !== undefined ? { lastSyncAt: state.lastSuccessAtMs } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
  };
}

/** Across the account's projects: the newest success, and the newest failure still unresolved. */
export function combineAccountSyncStatus(
  states: ReadonlyArray<T3TeamMirrorSyncStatus>,
): T3TeamJiraSyncStatus {
  let lastSyncAt: number | undefined;
  let newestError: { readonly text: string; readonly atMs: number } | undefined;
  for (const state of states) {
    if (state.lastSuccessAtMs !== undefined && (lastSyncAt ?? -1) < state.lastSuccessAtMs) {
      lastSyncAt = state.lastSuccessAtMs;
    }
    const text = unresolvedError(state);
    const atMs = state.lastErrorAtMs ?? 0;
    if (text !== undefined && (newestError === undefined || newestError.atMs < atMs)) {
      newestError = { text, atMs };
    }
  }
  return {
    ...(lastSyncAt !== undefined ? { lastSyncAt } : {}),
    ...(newestError !== undefined ? { lastError: newestError.text } : {}),
  };
}

export function readJiraSyncStatusForAccount(accountId: string) {
  return readT3TeamMirrorSyncStatusesForAccount(accountId).pipe(
    Effect.map(combineAccountSyncStatus),
    Effect.orElseSucceed((): T3TeamJiraSyncStatus => ({})),
  );
}

export function readJiraSyncStatusForProject(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}) {
  return readT3TeamMirrorSyncStatus({
    provider: input.account.provider,
    accountId: input.account.id,
    externalProjectId: input.externalProjectId,
  }).pipe(
    Effect.map(toJiraSyncStatus),
    Effect.orElseSucceed((): T3TeamJiraSyncStatus => ({})),
  );
}
