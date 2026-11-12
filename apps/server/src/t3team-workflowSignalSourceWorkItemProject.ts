/**
 * The `work-item.project-updates` poller: every change to the work items of the project's bound
 * Jira project, read off the backlog mirror (t3team-workflowSignalWorkItemProjectMirror.ts). The
 * mirror loop is the Jira poll; this source adds no Jira request of its own, except one bounded
 * `key in (…)` search per poll that has changes AND a JQL `query` to narrow them by.
 *
 * Cursor: the newest mirror `updated_at` read, plus the watched fields of recently seen items so a
 * change names what changed (`changedFields`, as `work-item.updates` does). An item the cursor does
 * not remember reports `first-seen`: new to the project, or changed for the first time since then. No cursor is a baseline: it starts from the mirror's newest row
 * (once the mirror has caught up at all) and emits nothing, so neither a lost cursor nor the
 * mirror's first walk replays the project's history.
 */
import { WorkItemUpdated, type SignalSourceContext } from "@t3team/sdk";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { isPersistenceSqlError } from "./persistence/Errors.ts";
import type {
  JiraMirrorBinding,
  MirrorChangeRow,
} from "./t3team-workflowSignalWorkItemProjectMirror.ts";
import {
  diffWorkItemFields,
  toNeutralWorkItem,
  workItemCursorFromFields,
} from "./t3team-workflowSignalSourceWorkItem.ts";
import type { SignalSourceHealth } from "./t3team-workflowSignalReconcilerCore.ts";
import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";

const CHANGES_PER_POLL = 500;
const REMEMBERED_ITEMS = 2_000;
const FIRST_POLL_MS = 5_000;

export interface WorkItemProjectPorts {
  readonly resolveBinding: (projectId: string) => Promise<JiraMirrorBinding | null>;
  /** Keep the mirror loop walking; false when no usable Jira session can drive it. */
  readonly keepMirrorWalking: (binding: JiraMirrorBinding) => Promise<boolean>;
  /** The mirror row time a new cursor starts at; null until the mirror first caught up. */
  readonly baseline: (binding: JiraMirrorBinding) => Promise<number | null>;
  readonly changedSince: (
    binding: JiraMirrorBinding,
    sinceMs: number,
    limit: number,
  ) => Promise<ReadonlyArray<MirrorChangeRow>>;
  readonly filterByJql: (
    binding: JiraMirrorBinding,
    jql: string,
    issueKeys: ReadonlyArray<string>,
  ) => Promise<ReadonlySet<string>>;
  readonly nowIso: () => string;
}

const Fields = Schema.Struct({
  status: Schema.optionalKey(Schema.String),
  assignee: Schema.optionalKey(Schema.String),
  labels: Schema.optionalKey(Schema.Array(Schema.String)),
  resolution: Schema.optionalKey(Schema.String),
  updated: Schema.optionalKey(Schema.String),
});
const Cursor = Schema.Struct({
  v: Schema.Literal(1),
  sinceMs: Schema.Number,
  items: Schema.Record(Schema.String, Fields),
});
type Cursor = typeof Cursor.Type;
const CursorJson = Schema.fromJsonString(Cursor);
const decodeCursor = Schema.decodeUnknownOption(CursorJson);
const encodeCursor = Schema.encodeSync(CursorJson);

const MirrorItem = Schema.Struct({
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
  updatedAt: Schema.optional(Schema.String),
});
const decodeMirrorItem = Schema.decodeUnknownOption(Schema.fromJsonString(MirrorItem));

export function startWorkItemProjectSignalInstance(input: {
  readonly ctx: SignalSourceContext<{ projectId: string; query?: string | undefined }>;
  readonly ports: WorkItemProjectPorts;
  readonly pollMs: number;
  readonly log: (message: string, fields?: unknown) => void;
}): {
  readonly stop: () => void;
  readonly tick: () => Promise<void>;
  readonly health: () => SignalSourceHealth;
} {
  const { ctx, ports, log } = input;
  const pollTimer = makeSignalPollTimer();
  let stopped = false;
  let lastError: string | undefined;
  let lastPollAt: string | undefined;

  const poll = async (binding: JiraMirrorBinding): Promise<Cursor | null> => {
    const raw = await ctx.getCursor();
    const prev = raw === null ? null : Option.getOrNull(decodeCursor(raw));
    if (prev === null) {
      const sinceMs = await ports.baseline(binding);
      return sinceMs === null ? null : { v: 1, sinceMs, items: {} };
    }
    const rows = await ports.changedSince(binding, prev.sinceMs, CHANGES_PER_POLL);
    const query = ctx.params.query?.trim();
    const inScope =
      query && rows.length > 0
        ? await ports.filterByJql(
            binding,
            query,
            rows.map((row) => row.issueKey),
          )
        : null;
    const items: Record<string, typeof Fields.Type> = { ...prev.items };
    for (const row of rows) {
      const item = Option.getOrNull(decodeMirrorItem(row.resourceJson));
      if (item === null) continue;
      const fields = { ...item, updated: item.updatedAt };
      const before = items[row.issueKey];
      const changedFields =
        before === undefined ? ["first-seen"] : diffWorkItemFields(before, fields);
      delete items[row.issueKey];
      items[row.issueKey] = workItemCursorFromFields(fields);
      if (changedFields.length === 0 || (inScope !== null && !inScope.has(row.issueKey))) continue;
      const payload = toNeutralWorkItem({
        issueKey: row.issueKey,
        title: item.title ?? row.issueKey,
        ...(item.url === undefined ? {} : { url: item.url }),
        fields,
        changedFields,
      });
      // A delivery fault throws out of the poll, so the cursor holds and the change re-emits.
      await ctx.emit(WorkItemUpdated, row.issueKey, payload).catch((error: unknown) => {
        if (isPersistenceSqlError(error)) throw error;
        log("work-item project signal emit rejected; skipping", { error: String(error) });
      });
    }
    const keys = Object.keys(items);
    for (const key of keys.slice(0, Math.max(0, keys.length - REMEMBERED_ITEMS))) delete items[key];
    const sinceMs = rows.reduce((max, row) => Math.max(max, row.updatedAt), prev.sinceMs);
    return { v: 1, sinceMs, items };
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const binding = await ports.resolveBinding(ctx.params.projectId);
      if (binding === null) {
        lastError = "the project is not bound to a Jira project";
        log("work-item project signal: the project is not bound to a Jira project", {
          projectId: ctx.params.projectId,
        });
        return;
      }
      const walking = await ports.keepMirrorWalking(binding);
      lastError = walking ? undefined : "no usable Jira session; the mirror is not refreshing";
      if (!walking) {
        log("work-item project signal: no usable Jira session; the mirror is not refreshing", {
          projectId: ctx.params.projectId,
        });
      }
      const next = await poll(binding);
      if (next !== null) await ctx.setCursor(encodeCursor(next));
      lastPollAt = ports.nowIso();
    } catch (error) {
      lastError = String(error);
      log("work-item project signal poll failed", { error: String(error) });
    } finally {
      if (!stopped) pollTimer.schedule(() => void tick(), input.pollMs);
    }
  };

  pollTimer.schedule(() => void tick(), Math.min(input.pollMs, FIRST_POLL_MS));
  return {
    tick,
    health: () => ({ lastPollAt, lastError }),
    stop: () => {
      stopped = true;
      pollTimer.stop();
    },
  };
}
