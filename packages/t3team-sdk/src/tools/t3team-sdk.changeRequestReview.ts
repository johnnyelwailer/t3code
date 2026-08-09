/**
 * Agent-facing change-request review draft (`t3team.change_request.review.draft_create`) — a
 * provider-neutral name for what GitHub calls a pull-request review and GitLab calls a merge-
 * request review (see `ChangeRequest` in `@t3tools/contracts`). The SDK owns the id, argument/
 * result schemas, and group classification; the server broker supplies the host-backed
 * implementation via `ctx.t3team` — the same shape as every tool in this directory (compare
 * `t3team-sdk.workflow.ts`).
 *
 * A NOTE ON WHAT DOES NOT EXIST YET, because an earlier revision of this comment implied otherwise:
 * `t3team.github.issue_comment.draft_create` is NOT a working comment poster this tool improves on.
 * It appears only as a classification entry in `packages/project-recipes/src/toolGroups.ts` and in
 * Epic 22's planned-tool catalog; it has no handler, and it is absent from
 * `IMPLEMENTED_T3TEAM_DRAFT_TOOL_CATALOG`. Calling it today returns "not implemented in this
 * runtime". There is no GitHub poster of any kind in this codebase: every route in the
 * `t3team-github-routes-*` family is a GET, and `GitHubBackendApi` exposes only reads. The same is
 * true of every other provider's source-control layer (`apps/server/src/sourceControl/`): each one
 * implements listing and reading change requests, never posting a review or a comment.
 *
 * So this tool is not competing with an existing path, and there is nothing upstream to build on
 * either — upstream's GitHub surface is a `gh` CLI wrapper (list / read / create / checkout) with
 * no review or comment posting at any point in its history. What this tool provides is the DRAFT
 * half; the posting half goes through whichever `SourceControlProvider` the host resolves for the
 * repository (`SourceControlProviderRegistry`), driven by that provider's own CLI/API layer (`gh`
 * for GitHub, `glab` for GitLab, and so on), whose identity is whoever authenticated that CLI —
 * `gitHubAuthStatus.ts` / `gitLabAuthStatus.ts` read the account back the same way. This deployment
 * is one server per user and the local DB is single-user by design
 * (`docs/t3team-mvp/30-capacity-and-teams.md:56,158`), so that identity IS the user — a posted
 * review is attributed correctly with no additional credential path to build.
 *
 * INVARIANT (non-negotiable): this tool never posts anything — it only normalizes and validates
 * the agent's intent into a draft the host renders for approval. The HOST holds whichever
 * provider's credential and is the only thing that ever calls a write API, and only after the user
 * approves exactly what will be submitted. The agent never sees a credential; this handler makes no
 * network call of its own — it is the seam, not the poster.
 */
import * as Schema from "effect/Schema";

import { changeRequestReviewDraft } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";

/**
 * Change-request review-submission events, minus `APPROVE`: letting an autonomous agent draft
 * (and, once approved verbatim, post) an *approving* review turns human approval into
 * rubber-stamping whatever the agent already decided. `COMMENT` and `REQUEST_CHANGES` still let it
 * flag every problem found; only the sign-off is withheld. `PENDING` is excluded too — it is
 * GitHub's internal state for an unsubmitted review, not a value passed to the submit-review call.
 *
 * These two values are GitHub's own submit-review vocabulary — the only one of the four providers
 * this codebase has an implemented review-posting model for (there is none, see above; GitHub is
 * simply the one whose API shape this tool was designed against). Whether `COMMENT` /
 * `REQUEST_CHANGES` map cleanly onto GitLab's discussion/note API, Bitbucket's PR comments, or
 * Azure DevOps's thread status is UNVERIFIED here — a future poster for one of those providers
 * decides how (or whether) to translate the event, the same way it must for the anchor shape below.
 */
export const ChangeRequestReviewDraftEvent = Schema.Literals(["COMMENT", "REQUEST_CHANGES"]);
export type ChangeRequestReviewDraftEvent = typeof ChangeRequestReviewDraftEvent.Type;

/**
 * Where an inline comment anchors on the diff: either a single `line` or a `start_line`..`line`
 * range (GitHub's two shapes) — never both at once, never a start past its end. The tagged union
 * makes a "range" with no start unrepresentable; the range arm's `check` covers the one thing the
 * union alone cannot express — an inverted `startLine`/`line` pair.
 *
 * ON PROVIDER TRANSLATION: this model was designed against GitHub's pull-request review API, and
 * this codebase has nothing implemented for the other three providers to check it against —
 * `gitLabMergeRequests.ts`, `bitbucketPullRequests.ts`, and `azureDevOpsPullRequests.ts`
 * (`apps/server/src/sourceControl/`) only decode list/read merge/pull-request records; none of
 * them model a comment, a discussion, or a line position. Whether `range` or even a bare `line`
 * round-trips through GitLab's/Bitbucket's/Azure DevOps's real comment APIs is UNVERIFIED. This
 * schema stays a superset on purpose rather than narrowing to a lowest common denominator no one
 * has confirmed either: a future non-GitHub poster maps what its API can express and explicitly
 * REJECTS (never silently drops) whatever anchor shape it cannot.
 */
export const ChangeRequestReviewCommentAnchor = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("line"),
    line: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  Schema.Struct({
    kind: Schema.Literal("range"),
    startLine: Schema.Int.check(Schema.isGreaterThan(0)),
    line: Schema.Int.check(Schema.isGreaterThan(0)),
  }).check(
    Schema.makeFilter(
      ({ startLine, line }: { readonly startLine: number; readonly line: number }) =>
        startLine <= line || "startLine must be less than or equal to line for a range anchor.",
    ),
  ),
]);
export type ChangeRequestReviewCommentAnchor = typeof ChangeRequestReviewCommentAnchor.Type;

/**
 * One inline finding. `anchor` is optional (GitHub also accepts a file-level comment with only a
 * `path`), but `suggestion` is meaningless without a concrete anchor to replace — a `suggestion`
 * with no `anchor` is rejected below rather than silently dropped or guessed at.
 */
export const ChangeRequestReviewDraftComment = Schema.Struct({
  /** Repository-relative path exactly as it appears in the diff; never absolute, never empty. */
  path: Schema.String.check(Schema.isMinLength(1)),
  anchor: Schema.optional(ChangeRequestReviewCommentAnchor),
  body: Schema.String,
  /** Verbatim replacement text rendered into the ```suggestion fence the host posts as-is. */
  suggestion: Schema.optional(Schema.String),
});
export type ChangeRequestReviewDraftComment = typeof ChangeRequestReviewDraftComment.Type;

export const CreateChangeRequestReviewDraftToolArgs = Schema.Struct({
  event: ChangeRequestReviewDraftEvent,
  /** Overall review text. May be empty only when at least one comment carries the review's content. */
  body: Schema.String,
  comments: Schema.Array(ChangeRequestReviewDraftComment),
  /**
   * Update this agent's previous review instead of adding another. Defaults to `false` — the
   * safe direction — because replacing is the destructive option: it can discard or supersede a
   * review the user (or another agent) already saw, while adding a new one is always additive
   * and never loses prior context. An agent that wants the replace behavior must say so.
   */
  replaceLatest: Schema.optional(Schema.Boolean),
});
export type CreateChangeRequestReviewDraftToolArgs =
  typeof CreateChangeRequestReviewDraftToolArgs.Type;

export const CreateChangeRequestReviewDraftToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  /** Stable id for the prepared draft; the host's approval UI and any follow-up reference it. */
  draftId: Schema.String,
  /** Whether posting this draft would replace an existing review rather than add a new one. */
  replacesExisting: Schema.Boolean,
  commentCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /**
   * The exact, normalized payload the host will render and, on approval, submit — not a summary
   * of it. A preview built from anything less than this literal payload can drift from what
   * actually gets posted.
   */
  draft: Schema.Struct({
    event: ChangeRequestReviewDraftEvent,
    body: Schema.String,
    comments: Schema.Array(ChangeRequestReviewDraftComment),
    replaceLatest: Schema.Boolean,
  }),
});
export type CreateChangeRequestReviewDraftToolResult =
  typeof CreateChangeRequestReviewDraftToolResult.Type;

/** The normalized shape handed to `ctx.t3team.draftChangeRequestReview` — trimmed and defaulted. */
export interface ChangeRequestReviewDraftInput {
  readonly event: ChangeRequestReviewDraftEvent;
  readonly body: string;
  readonly comments: ReadonlyArray<ChangeRequestReviewDraftComment>;
  readonly replaceLatest: boolean;
}

function normalizeComment(
  comment: ChangeRequestReviewDraftComment,
  index: number,
): ChangeRequestReviewDraftComment {
  const path = comment.path.trim();
  if (path.length === 0) {
    throw new Error(
      `t3team.change_request.review.draft_create requires a non-empty 'path' for comments[${index}].`,
    );
  }
  if (comment.suggestion !== undefined && comment.anchor === undefined) {
    throw new Error(
      `t3team.change_request.review.draft_create requires an 'anchor' for comments[${index}] because it carries a 'suggestion'.`,
    );
  }
  return { ...comment, path, body: comment.body.trim() };
}

export const createChangeRequestReviewDraftTool = defineTool({
  id: "t3team.change_request.review.draft_create",
  // NOT `githubWrite` (or any provider's own write group): this tool cannot merge, push or edit
  // anything on any provider. Asking for that grant to hand a human a draft would make every
  // review workflow over-privileged.
  group: changeRequestReviewDraft,
  args: CreateChangeRequestReviewDraftToolArgs,
  result: CreateChangeRequestReviewDraftToolResult,
  handler: async (args, ctx) => {
    const body = args.body.trim();
    const comments = args.comments.map((comment, index) => normalizeComment(comment, index));
    if (body.length === 0 && comments.length === 0) {
      throw new Error(
        "t3team.change_request.review.draft_create requires a non-empty 'body' or at least one comment; an empty review has nothing to show the user.",
      );
    }
    const input: ChangeRequestReviewDraftInput = {
      event: args.event,
      body,
      comments,
      replaceLatest: args.replaceLatest ?? false,
    };
    if (!ctx.t3team?.draftChangeRequestReview) {
      throw new Error(
        "t3team.change_request.review.draft_create requires a t3team change-request review client in ToolHandlerCtx.",
      );
    }
    // The host result is re-validated against CreateChangeRequestReviewDraftToolResult by
    // executeToolHandler.
    return (await ctx.t3team.draftChangeRequestReview(
      input,
    )) as CreateChangeRequestReviewDraftToolResult;
  },
});
