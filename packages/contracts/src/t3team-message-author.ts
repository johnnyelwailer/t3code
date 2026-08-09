/**
 * WHO wrote a message, when it was not the human at the keyboard.
 *
 * `t3teamExt.author` is the one attribution channel a client renders from, so every non-human
 * sender declares itself here rather than growing a parallel flag. Absence means "the user typed
 * it" — that is the whole backward-compatibility contract: a message written before a variant
 * existed carries no author and must keep rendering exactly as it always did.
 *
 * ── The variants ────────────────────────────────────────────────────────────
 * `system`   — the server or a workflow speaking TO the user (an escalation, a notice, a
 *              completion summary). Its optional `workflowRunId` / `recipeId` / `stepId` say which
 *              run produced it.
 * `actor`    — another thread, over inter-agent delivery; carries enough to attribute and
 *              navigate to the sender.
 * `workflow` — a workflow speaking TO THE AGENT: the user-role prompt an `askAgent` step posts to
 *              drive a turn. It is a `user`-role message because that is how a provider receives
 *              turn input, NOT because a person wrote it, and without this variant a client can
 *              only tell the two apart by sniffing the text. Machine instructions wearing the
 *              user's styling is the bug it exists to prevent; the fields carry what a collapsed
 *              row needs to summarise itself.
 *
 * Split out of `t3team-message-ext.ts` so that module stays inside the prefixed-file LOC ceiling;
 * both are re-exported from the package index, so importers are unaffected.
 */

import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const T3TeamMessageSystemAuthor = Schema.Struct({
  kind: Schema.Literal("system"),
  workflowRunId: Schema.optional(TrimmedNonEmptyString),
  recipeId: Schema.optional(TrimmedNonEmptyString),
  stepId: Schema.optional(TrimmedNonEmptyString),
});
export type T3TeamMessageSystemAuthor = typeof T3TeamMessageSystemAuthor.Type;

/**
 * Author of an inter-agent `actor`-role message: the sending thread (actor),
 * identified by its thread id + human title so the receiver and the UI can
 * attribute and navigate to it. `projectId` powers the "open sender thread"
 * navigation (actors share a project).
 */
export const T3TeamMessageActorAuthor = Schema.Struct({
  kind: Schema.Literal("actor"),
  threadId: Schema.String,
  projectId: Schema.String,
  title: Schema.String,
});
export type T3TeamMessageActorAuthor = typeof T3TeamMessageActorAuthor.Type;

/**
 * Author of the user-role prompt a workflow's `askAgent` step posts to start an agent turn.
 *
 * Every field is REQUIRED because there is no legacy data to be tolerant of — the variant is new,
 * so anything carrying it was written by the current dispatch path and can guarantee all three.
 * That lets a client render a collapsed, attributed row from this field alone, with no join and no
 * fallback: `label` is the summary line, `workflowRunId` names the run, and `stepId` is the ask's
 * correlationId — which is also what the live step activity is keyed by
 * (`t3team-wf-step:<stepId>`), so joining a prompt to its step in the plan card stays possible.
 */
export const T3TeamMessageWorkflowAuthor = Schema.Struct({
  kind: Schema.Literal("workflow"),
  workflowRunId: TrimmedNonEmptyString,
  stepId: TrimmedNonEmptyString,
  /** One line, already trimmed to a summary length by the sender. */
  label: TrimmedNonEmptyString,
});
export type T3TeamMessageWorkflowAuthor = typeof T3TeamMessageWorkflowAuthor.Type;

export const T3TeamMessageAuthor = Schema.Union([
  T3TeamMessageSystemAuthor,
  T3TeamMessageActorAuthor,
  T3TeamMessageWorkflowAuthor,
]);
export type T3TeamMessageAuthor = typeof T3TeamMessageAuthor.Type;
