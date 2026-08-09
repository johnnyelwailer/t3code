import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { SourceControlProviderKind } from "./sourceControl.ts";

/**
 * Where a proposal stands. `draft` is what the proposing tool publishes; `applied` and `dismissed`
 * are the reviewer's verdicts, recorded ON THE CARRIER so they survive a reload — before this the
 * payload was pinned to `draft` and the verdict lived only in the client's session store, so an
 * accepted rewrite came back as pending review the next time the thread was read.
 *
 * Additive by construction: every carrier ever written says `draft`, which is still a member.
 */
export const T3TeamDraftMutationStatus = Schema.Literals(["draft", "applied", "dismissed"]);
export type T3TeamDraftMutationStatus = typeof T3TeamDraftMutationStatus.Type;

export const T3TeamDraftMutationField = Schema.Literals([
  "assignee",
  "estimate",
  "status",
  "description",
  "comment",
  "subtask",
  "link",
]);
export type T3TeamDraftMutationField = typeof T3TeamDraftMutationField.Type;

/**
 * An agent-proposed, not-yet-applied mutation of an external work item — exactly the payload the
 * broker's `*.draft_*` tools return in `structuredContent.draftMutation`, plus a stable `id`.
 *
 * It is carried as typed message data rather than recovered from a provider's rendered tool call:
 * each adapter reshapes tool results for display (the Claude adapter does not even classify every
 * draft tool as an MCP call), so the timeline is not a transport.
 */
export const T3TeamJiraWorkItemDraftPayload = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Schema.Literal("jira-work-item-draft"),
  tool: TrimmedNonEmptyString,
  target: Schema.Struct({
    provider: Schema.Literal("jira"),
    issueIdOrKey: TrimmedNonEmptyString,
  }),
  field: T3TeamDraftMutationField,
  patch: Schema.Record(Schema.String, Schema.Unknown),
  status: T3TeamDraftMutationStatus,
  summary: Schema.optional(Schema.String),
  commitPolicy: Schema.Struct({
    requiresUserApproval: Schema.Boolean,
    commitSurface: TrimmedNonEmptyString,
  }),
});
export type T3TeamJiraWorkItemDraftPayload = typeof T3TeamJiraWorkItemDraftPayload.Type;

/**
 * Change-request review events a draft can carry — same restriction as the SDK tool's
 * `ChangeRequestReviewDraftEvent` (`packages/t3team-sdk/src/tools/t3team-sdk.changeRequestReview.ts`):
 * no `APPROVE`, so an autonomous agent can never draft its way to a rubber-stamped sign-off. The
 * two values mirror GitHub's own submit-review vocabulary (`COMMENT` / `REQUEST_CHANGES`) because
 * that is the only one of the four providers this codebase has an implemented review-posting model
 * for to name them after; see the SDK tool's doc comment for what that means for the other three.
 */
export const T3TeamChangeRequestReviewDraftEvent = Schema.Literals(["COMMENT", "REQUEST_CHANGES"]);
export type T3TeamChangeRequestReviewDraftEvent = typeof T3TeamChangeRequestReviewDraftEvent.Type;

/**
 * Mirrors the SDK's `ChangeRequestReviewCommentAnchor` shape verbatim — the carrier stores the
 * literal anchor the agent proposed, not a re-derivation of it. The range invariant
 * (`startLine <= line`) is already enforced where the draft is built (the SDK tool's arg schema);
 * re-checking it here would just be a second copy of that rule with a chance to drift from it.
 *
 * ON PROVIDER TRANSLATION (do not silently assume this travels): this three-shape model (single
 * `line`, a `startLine..line` range, or no anchor at all for a file-level comment) was designed
 * against GitHub's pull-request review API. This codebase has no implemented inline-comment or
 * review-posting model for GitLab, Bitbucket, or Azure DevOps to check it against —
 * `gitLabMergeRequests.ts`, `bitbucketPullRequests.ts`, and `azureDevOpsPullRequests.ts` only
 * decode list/read MR-or-PR records (title, url, refs, state); none of them touch comments,
 * discussions, or line positions. So whether a `range` or file-level anchor round-trips through
 * those three providers' real comment APIs is UNVERIFIED here. This schema deliberately stays a
 * superset rather than narrowing to what is known to work everywhere: a future poster for a
 * non-GitHub provider is expected to map what it can and explicitly reject (never silently drop)
 * whatever anchor shape its provider's API cannot express.
 */
export const T3TeamChangeRequestReviewDraftAnchor = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("line"), line: Schema.Int }),
  Schema.Struct({ kind: Schema.Literal("range"), startLine: Schema.Int, line: Schema.Int }),
]);
export type T3TeamChangeRequestReviewDraftAnchor = typeof T3TeamChangeRequestReviewDraftAnchor.Type;

/** One inline finding, carried with full fidelity: `path`, the exact anchor, the comment body, and
 * the exact suggestion text if any — everything the approval UI needs to render precisely what
 * would be posted, with nothing left to re-derive. */
export const T3TeamChangeRequestReviewDraftComment = Schema.Struct({
  path: TrimmedNonEmptyString,
  anchor: Schema.optional(T3TeamChangeRequestReviewDraftAnchor),
  body: Schema.String,
  suggestion: Schema.optional(Schema.String),
});
export type T3TeamChangeRequestReviewDraftComment =
  typeof T3TeamChangeRequestReviewDraftComment.Type;

/**
 * A source-control change request (GitHub calls it a pull request, GitLab a merge request) review,
 * drafted for approval. Additive sibling of {@link T3TeamJiraWorkItemDraftPayload} — a second
 * member of the {@link T3TeamDraftMutationPayload} union, not a repurposing of the Jira shape. The
 * Jira payload's `field`/`patch` describe a change to ONE named field of a work item; a
 * change-request review has no such single field (it is an event, a body, and N inline comments
 * each with their own anchor), so folding it into `patch: Record<string, unknown>` would flatten a
 * structured, faithfully-typed payload into an opaque bag the approval UI would have to guess the
 * shape of. Every field the SDK tool validated is carried here verbatim: `event`, `body`,
 * `comments` (with exact `path`/anchor/`suggestion`), and `replaceLatest`.
 *
 * `target.provider` is a real {@link SourceControlProviderKind}, resolved by the host through the
 * `SourceControlProviderRegistry` for the repository the launch thread is bound to — never assumed
 * to be `"github"`. It otherwise carries no repo/change-request identifier: the SDK tool's args
 * (`CreateChangeRequestReviewDraftToolArgs`) carry none either, so there is nothing here to invent
 * one from — resolving WHICH change request a draft belongs to is left to whatever eventually
 * posts it.
 */
export const T3TeamChangeRequestReviewDraftPayload = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Schema.Literal("change-request-review-draft"),
  tool: TrimmedNonEmptyString,
  target: Schema.Struct({
    provider: SourceControlProviderKind,
  }),
  event: T3TeamChangeRequestReviewDraftEvent,
  body: Schema.String,
  comments: Schema.Array(T3TeamChangeRequestReviewDraftComment),
  /**
   * The agent's intent to replace its previous review rather than add a new one. NOT YET honoured
   * by any poster — there is no change-request-review commit-after-approval path in this codebase
   * yet (the only existing "apply a draft" surface, `t3team-thread-draftMutation-status-route.ts`,
   * only flips a carrier's `status`; it never calls a source control provider). Recording the flag
   * faithfully here, rather than dropping it, is what lets a future poster honour it — silently
   * discarding it now would be indistinguishable from the agent never having asked. Deciding HOW
   * to honour it (dismiss the prior carrier? supersede the live review on submit?) is that
   * poster's job, not this draft-creation seam's.
   */
  replaceLatest: Schema.Boolean,
  status: T3TeamDraftMutationStatus,
  summary: Schema.optional(Schema.String),
  commitPolicy: Schema.Struct({
    requiresUserApproval: Schema.Boolean,
    commitSurface: TrimmedNonEmptyString,
  }),
});
export type T3TeamChangeRequestReviewDraftPayload =
  typeof T3TeamChangeRequestReviewDraftPayload.Type;

/**
 * Every kind of agent-proposed draft that can ride the `draft-mutation` carrier. A union, not a
 * single shape, because different externals need different fields to describe a proposed change
 * faithfully (compare {@link T3TeamJiraWorkItemDraftPayload} and
 * {@link T3TeamChangeRequestReviewDraftPayload}) — widening this union is how a new draft kind is
 * added; no existing member's shape ever changes.
 */
export const T3TeamDraftMutationPayload = Schema.Union([
  T3TeamJiraWorkItemDraftPayload,
  T3TeamChangeRequestReviewDraftPayload,
]);
export type T3TeamDraftMutationPayload = typeof T3TeamDraftMutationPayload.Type;

/**
 * A POINTER to a work item that has a draft waiting on its review surface — what a run's completion
 * message carries so the conversation can render a navigable card instead of prose the reader has to
 * act on themselves ("Proposed a rewritten description for NXAI-6 — review it on the work item").
 *
 * Deliberately NOT the draft itself: the proposal already travels as
 * {@link T3TeamMessageDraftMutationAttachment} on its own hidden carrier, and duplicating the patch
 * here would give the client two sources for one draft that can disagree after an accept. This says
 * only "there is something to review, and here is where" — id fields to navigate by, plus a line of
 * preview so the card means something before the user clicks.
 *
 * `summary` and `field` are optional because the producer is a workflow body's output: a body that
 * names neither still gets a working card, just a plainer one.
 */
export const T3TeamMessageWorkItemDraftRefAttachment = Schema.Struct({
  kind: Schema.Literal("work-item-draft"),
  projectId: TrimmedNonEmptyString,
  issueIdOrKey: TrimmedNonEmptyString,
  /** Which field the draft proposes, when the producer says so. Same vocabulary as the draft. */
  field: Schema.optional(T3TeamDraftMutationField),
  /** One line for the card face. */
  summary: Schema.optional(Schema.String),
});
export type T3TeamMessageWorkItemDraftRefAttachment =
  typeof T3TeamMessageWorkItemDraftRefAttachment.Type;

/**
 * Carrier for one proposed draft. The message it rides on is hidden from both the user and the
 * agent prompt; its only job is to deliver the draft to the client's review surface (and to make
 * the proposal replayable when the thread is reloaded). The proposing thread is the thread the
 * message belongs to, so no `sourceThreadId` is duplicated here.
 */
export const T3TeamMessageDraftMutationAttachment = Schema.Struct({
  kind: Schema.Literal("draft-mutation"),
  draft: T3TeamDraftMutationPayload,
});
export type T3TeamMessageDraftMutationAttachment = typeof T3TeamMessageDraftMutationAttachment.Type;
