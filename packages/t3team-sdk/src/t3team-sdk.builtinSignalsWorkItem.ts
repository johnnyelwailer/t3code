/**
 * Tier B work-item sources (design 42 §8). Payloads use the neutral work-item vocabulary (issueKey,
 * title, state, assignee, labels); both sources wrap the existing Jira integration and emit the
 * same `work-item.updated` signal, so a consumer does not care which scope produced an event.
 *
 *   • `work-item.updates` — one work item, polled on its own.
 *   • `work-item.project-updates` — every work item of the project's bound Jira project, read off
 *     the backlog mirror the host already keeps in sync. An optional JQL `query` narrows it.
 */

import * as Schema from "effect/Schema";

import {
  ProjectScopeParams,
  type ProjectScopeParamsType,
} from "./t3team-sdk.builtinSignalsProject.ts";
import { builtinSignalSource, defineSignal, type SignalSourceRef } from "./t3team-sdk.signal.ts";

/** The neutral work-item snapshot a work-item signal carries. */
export const WorkItemPayload = Schema.Struct({
  provider: Schema.String,
  issueKey: Schema.String,
  title: Schema.String,
  url: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
  updatedAt: Schema.optional(Schema.String),
  changedFields: Schema.optional(Schema.Array(Schema.String)),
});
export type WorkItemPayloadType = Schema.Schema.Type<typeof WorkItemPayload>;

export const WorkItemUpdated = defineSignal("work-item.updated", WorkItemPayload);

/** Shared Tier B identity: one work item of one project, for one (local) account. */
export const WorkItemParams = Schema.Struct({
  projectId: Schema.String,
  issueKey: Schema.String,
  accountId: Schema.optional(Schema.String),
});
export type WorkItemParamsType = Schema.Schema.Type<typeof WorkItemParams>;

/** Watches one work item: emits on every observed field change (state, assignee, …). */
export const WorkItemUpdates: SignalSourceRef<WorkItemParamsType, [typeof WorkItemUpdated]> =
  builtinSignalSource({
    name: "work-item.updates",
    params: WorkItemParams,
    emits: [WorkItemUpdated],
  });

/** Watches the project's whole Jira project (or the JQL-narrowed part of it). */
export const WorkItemProjectUpdates: SignalSourceRef<
  ProjectScopeParamsType,
  [typeof WorkItemUpdated]
> = builtinSignalSource({
  name: "work-item.project-updates",
  params: ProjectScopeParams,
  emits: [WorkItemUpdated],
});
