/**
 * Context binding: the view a chat thread was started from, stored as a thread fact under the key
 * below and written by `t3team.contextBinding.record` (orchestration:operate). A pull or merge
 * request is a `ChangeRequest`; the work item key is the tracker's own key.
 */
import * as Schema from "effect/Schema";

import { PositiveInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Thread facts `extensions` key holding a {@link T3TeamContextBinding}. */
export const T3TEAM_CONTEXT_BINDING_FACT_KEY = "t3team.contextBinding";

/** Bumped when a stored binding changes shape; readers skip versions they do not know. */
export const T3TEAM_CONTEXT_BINDING_VERSION = 1;

export const T3TeamContextBindingKind = Schema.Literals([
  "my-work",
  "project-dashboard",
  "work-item",
  "change-request",
]);
export type T3TeamContextBindingKind = typeof T3TeamContextBindingKind.Type;

/** The change request a chat is about, addressed as the right panel's pull-request surface is. */
export const T3TeamContextBindingChangeRequest = Schema.Struct({
  repository: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  number: PositiveInt,
  /** Source-control host; absent when the surface did not carry one. */
  host: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
});
export type T3TeamContextBindingChangeRequest = typeof T3TeamContextBindingChangeRequest.Type;

const version = Schema.Literal(T3TEAM_CONTEXT_BINDING_VERSION);

/** The kind decides which reference is required, so a binding cannot be half-formed. */
export const T3TeamContextBinding = Schema.Union([
  Schema.Struct({ version, kind: Schema.Literal("my-work"), projectId: ProjectId }),
  Schema.Struct({ version, kind: Schema.Literal("project-dashboard"), projectId: ProjectId }),
  Schema.Struct({
    version,
    kind: Schema.Literal("work-item"),
    projectId: ProjectId,
    workItemKey: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  }),
  Schema.Struct({
    version,
    kind: Schema.Literal("change-request"),
    projectId: ProjectId,
    changeRequest: T3TeamContextBindingChangeRequest,
  }),
]);
export type T3TeamContextBinding = typeof T3TeamContextBinding.Type;

export const T3TeamContextBindingRecordInput = Schema.Struct({
  threadId: ThreadId,
  binding: T3TeamContextBinding,
});
export type T3TeamContextBindingRecordInput = typeof T3TeamContextBindingRecordInput.Type;

export const T3TeamContextBindingRecordResult = Schema.Struct({ binding: T3TeamContextBinding });
export type T3TeamContextBindingRecordResult = typeof T3TeamContextBindingRecordResult.Type;

export class T3TeamContextBindingError extends Schema.TaggedError<T3TeamContextBindingError>()(
  "T3TeamContextBindingError",
  { message: Schema.String },
) {}

const decodeContextBinding = Schema.decodeUnknownOption(T3TeamContextBinding);

/** The binding recorded on a thread's facts, if any (and well-formed, and a known version). */
export function readThreadContextBinding(
  facts: { readonly extensions?: { readonly [key: string]: unknown } | undefined } | undefined,
): T3TeamContextBinding | null {
  const value = facts?.extensions?.[T3TEAM_CONTEXT_BINDING_FACT_KEY];
  if (value === undefined) return null;
  const decoded = decodeContextBinding(value);
  return decoded._tag === "Some" ? decoded.value : null;
}
