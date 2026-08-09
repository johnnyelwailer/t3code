/**
 * Host wiring for `t3team.change_request.review.draft_create` — the SDK tool that lets a workflow
 * body prepare a change-request review (GitHub's pull-request review, GitLab's merge-request
 * review, or the equivalent on whichever `SourceControlProviderKind` the repository is on) for a
 * human to approve (`packages/t3team-sdk/src/tools/t3team-sdk.changeRequestReview.ts`). Before this
 * module the tool's handler called `ctx.t3team.draftChangeRequestReview`, which no host populated,
 * so every call threw.
 *
 * Modeled on the work-item draft family's carrier delivery (`t3team-draftMutationPublish.ts`), but
 * deliberately NOT routed through it: that publisher is wired to the broker's raw-JSON dispatch
 * path (`callT3TeamDraftMutationToolEffect` → `binding.callTool({server, tool, arguments})`) and
 * hardcodes the Jira draft kind at every seam (`readT3TeamDraftMutation`'s
 * `kind === "jira-work-item-draft"` check, the `jira-draft:` id prefix). This tool instead reaches
 * the host through `ctx.t3team.draftChangeRequestReview` — a typed, first-class client method, the
 * same shape as `runSandbox`/`runWorkflow`/`listRecipes` (`packages/t3team-sdk/src/t3team-sdk.types.ts`),
 * not the broker's `callHostTool`-by-string-id seam the work-item drafts use. So this module builds
 * and publishes the SAME kind of hidden carrier message directly, using the
 * `change-request-review-draft` payload kind added additively alongside the Jira one
 * (`packages/contracts/src/t3team-draft-mutation.ts`), rather than reusing the Jira-shaped
 * publisher's hardcoded checks.
 *
 * WHICH PROVIDER: `target.provider` is a real `SourceControlProviderKind`, resolved through the
 * caller-supplied `resolveProviderKind` — normally backed by `SourceControlProviderRegistry.resolve`
 * against the launch's project workspace root (see `t3team-thread-recipe-workflow-routes.ts`), never
 * hardcoded to `"github"`. When no resolver is supplied (a rehydrated run currently has none — the
 * persisted `WorkflowRun` row carries no workspace cwd for `t3team-workflowRehydrateRun.ts` to
 * resolve a provider from, and adding one is a schema change outside this seam's scope) or the
 * resolution itself fails, this falls back to `"unknown"` — a real member of
 * `SourceControlProviderKind` — rather than guessing GitHub. That is an honest "could not
 * determine", not a silent correctness bug: nothing here ever POSTS, so a draft with an `"unknown"`
 * target still shows the reviewer everything it proposed, just without a confirmed provider label.
 *
 * INVARIANTS carried over from the SDK tool's own doc comment, restated here because this is where
 * they are actually enforced:
 *  - NEVER posts to any source-control provider. Publishing the hidden carrier message is the
 *    entire effect of a successful call; nothing in this module calls a provider API.
 *  - NEVER sees, needs, or forwards a credential. There is nothing here to authenticate with — the
 *    draft is built entirely from the agent's own (already-validated-by-the-SDK-tool) input, plus
 *    a provider KIND (never a token) read from the registry.
 *
 * @module t3team-workflowChangeRequestReviewDraftTool
 */
import {
  CommandId,
  MessageId,
  ThreadId,
  type OrchestrationCommand,
  type SourceControlProviderKind,
  type T3TeamChangeRequestReviewDraftPayload,
  type T3TeamMessageExt,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { createChangeRequestReviewDraftTool } from "@t3team/sdk/tools/t3teamChangeRequestReview";
import type {
  CreateChangeRequestReviewDraftToolResult,
  ChangeRequestReviewDraftInput,
} from "@t3team/sdk/tools/t3teamChangeRequestReview";
import type { T3TeamToolHandlerClient, ToolRef } from "@t3team/sdk";

import { t3teamRandomUUID } from "./t3team-random.ts";

/** The one SDK-registered ref this module bridges to the host, added to a workflow body's
 * `getTools()` tree the same way the work-item draft refs are
 * (`t3teamWorkflowHostToolRunOptions` in `t3team-workflowHostDraftTools.ts`) — just via its own
 * ref rather than a broker-id wrapper, because the tool is already a proper `defineTool` export
 * with its own typed args/result, so there is no generic wrapper to build. */
export const T3TEAM_WORKFLOW_CHANGE_REQUEST_REVIEW_DRAFT_TOOL_REFS: ReadonlyArray<
  ToolRef<unknown, unknown>
> = [
  // Same widening the SDK's own registry does when it stores a concretely-typed ref
  // (`registry.tools.set(opts.id, ref as T.AnyToolRef)` in `t3team-sdk.ts`): a tool's real args/
  // result types are exactly what its own handler needs, and only that handler ever calls itself
  // with them — this array exists to make heterogeneous refs listable, not callable directly.
  createChangeRequestReviewDraftTool as unknown as ToolRef<unknown, unknown>,
];

/** What `previous` needs to remember to dismiss its own carrier later: the message id to
 * re-upsert, and the ext to re-upsert it WITH (see `withDraftMutationStatus` in
 * `t3team-draftMutationStatus.ts` for the equivalent human-facing move — re-upserting the exact
 * same message id with an updated `status` is how a verdict is recorded on this carrier scheme). */
interface PublishedChangeRequestReviewDraft {
  readonly messageId: string;
  readonly ext: T3TeamMessageExt;
}

function buildCarrierExt(draft: T3TeamChangeRequestReviewDraftPayload): T3TeamMessageExt {
  return {
    author: { kind: "system" },
    // Hidden from both surfaces, exactly like the work-item draft carrier: this message is
    // transport for the review surface, not something to show in the chat or feed to the agent.
    visibleToUser: false,
    visibleToAgent: false,
    attachments: [{ kind: "draft-mutation", draft }],
  };
}

function dismissedExt(ext: T3TeamMessageExt): T3TeamMessageExt {
  return {
    ...ext,
    attachments: ext.attachments?.map((attachment) =>
      attachment.kind === "draft-mutation"
        ? { ...attachment, draft: { ...attachment.draft, status: "dismissed" as const } }
        : attachment,
    ),
  };
}

/**
 * Builds the real `draftChangeRequestReview` client method for one launch thread. One instance per
 * run — `previous` is captured in this closure's own scope, not read back from anywhere durable, so
 * it means exactly "the last draft THIS RUN published" and nothing more.
 *
 * `replaceLatest` DECISION (non-negotiable brief item): there is no change-request-review commit-
 * after-approval path anywhere in this codebase yet — the only existing "apply a draft" surface
 * (`t3team-thread-draftMutation-status-route.ts`) flips a carrier's `status`; it never calls a
 * source-control provider. So "replace this agent's previous review" cannot mean "supersede the
 * live review on the provider" here — nothing can act on any provider yet. What it CAN mean,
 * entirely within the existing draft lifecycle, is: dismiss this run's own previous PENDING carrier
 * before publishing the new one, exactly like a human dismissing a draft they no longer want
 * reviewed. That is what this does. If a future poster wants "replace" to also mean "submit as an
 * update to the previously posted review" (once one exists), implementing that is the poster's job,
 * not this draft-creation seam's — `replaceLatest` is still carried on the payload verbatim
 * (`T3TeamChangeRequestReviewDraftPayload.replaceLatest`) precisely so that job has the intent to
 * act on.
 */
export function makeT3TeamChangeRequestReviewDraftMethod(input: {
  readonly threadId: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  /** Resolves the launch's `SourceControlProviderKind` — normally
   * `SourceControlProviderRegistry.resolve({ cwd })` for the project workspace root, bound at the
   * call site so this module never needs to know how a provider is detected. Absent, or a call that
   * rejects, both fall back to `"unknown"` (see the module doc comment for why that is the honest
   * choice rather than assuming `"github"`). */
  readonly resolveProviderKind?: (() => Promise<SourceControlProviderKind>) | undefined;
}): NonNullable<T3TeamToolHandlerClient["draftChangeRequestReview"]> {
  const { threadId, dispatch, resolveProviderKind } = input;
  let previous: PublishedChangeRequestReviewDraft | undefined;

  const upsertCarrier = (messageId: string, ext: T3TeamMessageExt): Promise<void> =>
    dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`server:t3team:change-request-review-draft:${t3teamRandomUUID()}`),
      threadId: ThreadId.make(threadId),
      // Same message id on a re-upsert (the dismiss path below) UPDATES the carrier in place,
      // same as the human accept/dismiss route; a fresh id (the publish path) creates a new one.
      message: {
        messageId: MessageId.make(messageId),
        role: "system",
        text: "",
        turnId: null,
        streaming: false,
        t3teamExt: ext,
      },
      createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });

  return async (
    draftInput: ChangeRequestReviewDraftInput,
  ): Promise<CreateChangeRequestReviewDraftToolResult> => {
    if (draftInput.replaceLatest && previous !== undefined) {
      // Best-effort: if dismissing the prior carrier fails, publish the new one anyway. The
      // reviewer then sees both instead of one — never fewer drafts than were actually proposed.
      await upsertCarrier(previous.messageId, dismissedExt(previous.ext)).catch(() => {});
    }

    const providerKind =
      resolveProviderKind === undefined
        ? ("unknown" as const)
        : await resolveProviderKind().catch(() => "unknown" as const);

    const messageId = t3teamRandomUUID();
    const draft: T3TeamChangeRequestReviewDraftPayload = {
      id: `change-request-review-draft:${messageId}`,
      kind: "change-request-review-draft",
      tool: createChangeRequestReviewDraftTool.id,
      target: { provider: providerKind },
      event: draftInput.event,
      body: draftInput.body,
      comments: draftInput.comments,
      replaceLatest: draftInput.replaceLatest,
      status: "draft",
      commitPolicy: { requiresUserApproval: true, commitSurface: "t3team-ui" },
    };
    const ext = buildCarrierExt(draft);

    try {
      await upsertCarrier(messageId, ext);
    } catch {
      // A draft the reviewer will never see is not a proposal — fail loudly rather than telling
      // the agent its review is waiting for approval somewhere nobody is looking (mirrors
      // `makeT3TeamDraftMutationPublisher`'s same call).
      throw new Error(
        "The change-request review draft was built but could not be published for review; nothing is pending. Retry, or draft again.",
      );
    }
    previous = { messageId, ext };

    return {
      ok: true,
      draftId: draft.id,
      replacesExisting: draftInput.replaceLatest,
      commentCount: draftInput.comments.length,
      draft: {
        event: draftInput.event,
        body: draftInput.body,
        comments: draftInput.comments,
        replaceLatest: draftInput.replaceLatest,
      },
    };
  };
}
