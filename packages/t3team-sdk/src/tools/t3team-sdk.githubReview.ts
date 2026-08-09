/**
 * Agent-facing GitHub pull-request review draft (`t3team.github.review.draft_create`). The SDK
 * owns the id, argument/result schemas, and group classification; the server broker supplies the
 * host-backed implementation via `ctx.t3team` — the same shape as every tool in this directory
 * (compare `t3team-sdk.workflow.ts`). Fills the gap left by the only other GitHub write path,
 * `t3team.github.issue_comment.draft_create` (`packages/project-recipes/src/toolGroups.ts`),
 * which posts one conversation-tab comment but cannot anchor to `path:line`, request changes, or
 * replace a previous review.
 *
 * INVARIANT (non-negotiable): this tool never posts anything — it only normalizes and validates
 * the agent's intent into a draft the host renders for approval. The HOST holds the GitHub token
 * and is the only thing that ever calls the write API, and only after the user approves exactly
 * what will be submitted. The agent never sees a credential; this handler makes no network call
 * of its own — it is the seam, not the poster.
 */
import * as Schema from "effect/Schema";

import { githubReviewDraft } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";

/**
 * GitHub's review-submission events, minus `APPROVE`: letting an autonomous agent draft (and,
 * once approved verbatim, post) an *approving* review turns human approval into rubber-stamping
 * whatever the agent already decided. `COMMENT` and `REQUEST_CHANGES` still let it flag every
 * problem found; only the sign-off is withheld. `PENDING` is excluded too — it is GitHub's
 * internal state for an unsubmitted review, not a value passed to the submit-review call.
 */
export const GithubReviewDraftEvent = Schema.Literals(["COMMENT", "REQUEST_CHANGES"]);
export type GithubReviewDraftEvent = typeof GithubReviewDraftEvent.Type;

/**
 * Where an inline comment anchors on the diff: either a single `line` or a `start_line`..`line`
 * range (GitHub's two shapes) — never both at once, never a start past its end. The tagged union
 * makes a "range" with no start unrepresentable; the range arm's `check` covers the one thing the
 * union alone cannot express — an inverted `startLine`/`line` pair.
 */
export const GithubReviewCommentAnchor = Schema.Union([
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
export type GithubReviewCommentAnchor = typeof GithubReviewCommentAnchor.Type;

/**
 * One inline finding. `anchor` is optional (GitHub also accepts a file-level comment with only a
 * `path`), but `suggestion` is meaningless without a concrete anchor to replace — a `suggestion`
 * with no `anchor` is rejected below rather than silently dropped or guessed at.
 */
export const GithubReviewDraftComment = Schema.Struct({
  /** Repository-relative path exactly as it appears in the diff; never absolute, never empty. */
  path: Schema.String.check(Schema.isMinLength(1)),
  anchor: Schema.optional(GithubReviewCommentAnchor),
  body: Schema.String,
  /** Verbatim replacement text rendered into the ```suggestion fence the host posts as-is. */
  suggestion: Schema.optional(Schema.String),
});
export type GithubReviewDraftComment = typeof GithubReviewDraftComment.Type;

export const CreateGithubReviewDraftToolArgs = Schema.Struct({
  event: GithubReviewDraftEvent,
  /** Overall review text. May be empty only when at least one comment carries the review's content. */
  body: Schema.String,
  comments: Schema.Array(GithubReviewDraftComment),
  /**
   * Update this agent's previous review instead of adding another. Defaults to `false` — the
   * safe direction — because replacing is the destructive option: it can discard or supersede a
   * review the user (or another agent) already saw, while adding a new one is always additive
   * and never loses prior context. An agent that wants the replace behavior must say so.
   */
  replaceLatest: Schema.optional(Schema.Boolean),
});
export type CreateGithubReviewDraftToolArgs = typeof CreateGithubReviewDraftToolArgs.Type;

export const CreateGithubReviewDraftToolResult = Schema.Struct({
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
    event: GithubReviewDraftEvent,
    body: Schema.String,
    comments: Schema.Array(GithubReviewDraftComment),
    replaceLatest: Schema.Boolean,
  }),
});
export type CreateGithubReviewDraftToolResult = typeof CreateGithubReviewDraftToolResult.Type;

/** The normalized shape handed to `ctx.t3team.draftGithubReview` — trimmed and defaulted. */
export interface GithubReviewDraftInput {
  readonly event: GithubReviewDraftEvent;
  readonly body: string;
  readonly comments: ReadonlyArray<GithubReviewDraftComment>;
  readonly replaceLatest: boolean;
}

function normalizeComment(
  comment: GithubReviewDraftComment,
  index: number,
): GithubReviewDraftComment {
  const path = comment.path.trim();
  if (path.length === 0) {
    throw new Error(
      `t3team.github.review.draft_create requires a non-empty 'path' for comments[${index}].`,
    );
  }
  if (comment.suggestion !== undefined && comment.anchor === undefined) {
    throw new Error(
      `t3team.github.review.draft_create requires an 'anchor' for comments[${index}] because it carries a 'suggestion'.`,
    );
  }
  return { ...comment, path, body: comment.body.trim() };
}

export const createGithubReviewDraftTool = defineTool({
  id: "t3team.github.review.draft_create",
  // NOT `githubWrite`: this tool cannot merge, push or edit anything. Asking for that
  // grant to hand a human a draft would make every review workflow over-privileged.
  group: githubReviewDraft,
  args: CreateGithubReviewDraftToolArgs,
  result: CreateGithubReviewDraftToolResult,
  handler: async (args, ctx) => {
    const body = args.body.trim();
    const comments = args.comments.map((comment, index) => normalizeComment(comment, index));
    if (body.length === 0 && comments.length === 0) {
      throw new Error(
        "t3team.github.review.draft_create requires a non-empty 'body' or at least one comment; an empty review has nothing to show the user.",
      );
    }
    const input: GithubReviewDraftInput = {
      event: args.event,
      body,
      comments,
      replaceLatest: args.replaceLatest ?? false,
    };
    if (!ctx.t3team?.draftGithubReview) {
      throw new Error(
        "t3team.github.review.draft_create requires a t3team GitHub review client in ToolHandlerCtx.",
      );
    }
    // The host result is re-validated against CreateGithubReviewDraftToolResult by executeToolHandler.
    return (await ctx.t3team.draftGithubReview(input)) as CreateGithubReviewDraftToolResult;
  },
});
