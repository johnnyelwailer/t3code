/**
 * The Tier B built-in source (GHE #332, design 42 §8): `work-item.updates` over the existing
 * Jira integration — one bounded poll per watched issue, diffed against the durable cursor.
 *
 * Auth resolves BY REFERENCE inside `start` (design 42 §4: params are identity, never
 * credentials): `accountId` names the persisted Atlassian account; absent, the host's single
 * persisted auth is used. The poll reads through the Atlassian provider's `getResource` — the
 * same path the rest of the host uses for Jira resources — and maps the provider snapshot to
 * the neutral work-item vocabulary the SDK's signal declares.
 *
 * A change = any watched field (status, assignee, labels, resolution, updated) differs from the
 * cursor's last observation. The cursor stores those values, so a host-down window is bridged:
 * after a restart the first poll re-reads and emits the transition the cursor remembers.
 */

import { WorkItemUpdated, type SignalSourceContext, type SignalSourceInstance } from "@t3team/sdk";

import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";
import { isPersistenceSqlError } from "./persistence/Errors.ts";

import type { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";

export interface WorkItemCursor {
  readonly status?: string;
  readonly assignee?: string;
  readonly labels?: ReadonlyArray<string>;
  readonly resolution?: string;
  readonly updated?: string;
}

const WATCHED_FIELDS = ["status", "assignee", "labels", "resolution", "updated"] as const;

/** The neutral work-item payload the `work-item.updated` signal carries, built from a provider
 * resource snapshot (the provider shape is mapped here and nowhere else). */
export function toNeutralWorkItem(input: {
  readonly issueKey: string;
  readonly title: string;
  readonly url?: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly changedFields: ReadonlyArray<string>;
}): {
  readonly provider: string;
  readonly issueKey: string;
  readonly title: string;
  readonly state?: string;
  readonly assignee?: string;
  readonly labels?: string[];
  readonly updatedAt?: string;
  readonly changedFields: string[];
} {
  const status = input.fields["status"];
  const assignee = input.fields["assignee"];
  const labels = input.fields["labels"];
  const updated = input.fields["updated"];
  return {
    provider: "atlassian",
    issueKey: input.issueKey,
    title: input.title,
    ...(typeof status === "string" ? { state: status } : {}),
    ...(typeof assignee === "string" ? { assignee } : {}),
    ...(Array.isArray(labels)
      ? { labels: labels.filter((l): l is string => typeof l === "string") }
      : {}),
    ...(typeof updated === "string" ? { updatedAt: updated } : {}),
    changedFields: [...input.changedFields],
  };
}

/** Diff the watched fields of a fresh observation against the cursor → changed field names. */
export function diffWorkItemFields(
  prev: WorkItemCursor | null,
  fields: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> {
  if (prev === null) return []; // baseline, never retroactive
  const changed: string[] = [];
  for (const field of WATCHED_FIELDS) {
    const before = prev[field];
    const after = fields[field];
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) changed.push(field);
  }
  return changed;
}

/** The cursor shape read off a fresh observation (absent fields stay absent). */
export function workItemCursorFromFields(
  fields: Readonly<Record<string, unknown>>,
): WorkItemCursor {
  const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  const status = asString(fields["status"]);
  const assignee = asString(fields["assignee"]);
  const labels = Array.isArray(fields["labels"])
    ? (fields["labels"] as unknown[]).filter((l): l is string => typeof l === "string")
    : undefined;
  const resolution = asString(fields["resolution"]);
  const updated = asString(fields["updated"]);
  return {
    ...(status !== undefined ? { status } : {}),
    ...(assignee !== undefined ? { assignee } : {}),
    ...(labels !== undefined ? { labels } : {}),
    ...(resolution !== undefined ? { resolution } : {}),
    ...(updated !== undefined ? { updated } : {}),
  };
}

/** Start the `work-item.updates` instance: poll the issue, diff the watched fields, emit on
 * change. `resolveProvider` is the host's per-tick auth resolution (by reference — see the
 * module header); the returned handle's `stop` clears the poll timer. */
export function startWorkItemSignalInstance(input: {
  readonly ctx: SignalSourceContext<{
    projectId: string;
    issueKey: string;
    accountId?: string;
  }>;
  readonly pollMs: number;
  readonly resolveProvider: (accountId?: string) => Promise<AtlassianIntegrationProvider | undefined>;
  readonly log: (message: string, fields?: unknown) => void;
}): SignalSourceInstance {
  const { ctx, pollMs, log } = input;
  const issueKey = ctx.params.issueKey;
  const account = ctx.params.accountId;
  const ref = { provider: "atlassian", kind: "issue", id: issueKey, title: issueKey };

  const pollTimer = makeSignalPollTimer();
  let stopped = false;

  const readCursor = async (): Promise<WorkItemCursor | null> => {
    const raw = await ctx.getCursor();
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as WorkItemCursor;
    } catch {
      return null;
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const provider = await input.resolveProvider(account).catch((error) => {
        log("work-item signal poll: no usable Atlassian auth", { error: String(error) });
        return undefined;
      });
      if (provider === undefined) return;
      const snapshot = await provider
        .getResource(ref)
        .catch((error: unknown) => {
          log("work-item signal poll: resource read failed", { error: String(error) });
          return null;
        });
      if (snapshot === null) return;
      const prev = await readCursor();
      const cursor = workItemCursorFromFields(snapshot.fields);
      const changedFields = diffWorkItemFields(prev, snapshot.fields);
      let allEmitted = true;
      if (prev !== null && changedFields.length > 0) {
        const payload = toNeutralWorkItem({
          issueKey,
          title: snapshot.summary ?? snapshot.ref.title,
          ...(snapshot.ref.url !== undefined ? { url: snapshot.ref.url } : {}),
          fields: snapshot.fields,
          changedFields,
        });
        // At-least-once (GHE #332 review), mirroring the SCM poller: a TRANSIENT delivery
        // failure (tagged `PersistenceSqlError`) holds the cursor so the change re-emits next
        // tick; a source-side emit fault is swallowed (it would never succeed).
        try {
          await ctx.emit(WorkItemUpdated, issueKey, payload);
        } catch (error) {
          if (isPersistenceSqlError(error)) {
            allEmitted = false;
            log("work-item signal emit failed (delivery); holding the cursor for redelivery", {
              error: String(error),
            });
          } else {
            log("work-item signal emit rejected at the delivery boundary; skipping", {
              error: String(error),
            });
          }
        }
      }
      if (allEmitted) {
        await ctx.setCursor(JSON.stringify(cursor));
      }
    } finally {
      if (!stopped) pollTimer.schedule(() => void tick(), pollMs);
    }
  };

  pollTimer.schedule(() => void tick(), pollMs);
  return {
    stop: () => {
      stopped = true;
      pollTimer.stop();
    },
  };
}
