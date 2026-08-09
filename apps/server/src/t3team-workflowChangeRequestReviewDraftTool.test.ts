/**
 * `makeT3TeamChangeRequestReviewDraftMethod` is the real host implementation behind
 * `ctx.t3team.draftChangeRequestReview` — these pin what the SDK tool's own tests
 * (`t3team-sdk.changeRequestReview.test.ts`) cannot: that a real call actually reaches the
 * thread's review surface with every anchor intact, resolves (or honestly falls back on) a real
 * `SourceControlProviderKind`, never dispatches anything that could reach a source-control
 * provider, and carries `replaceLatest` through faithfully.
 */
import type { OrchestrationCommand } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type {
  CreateChangeRequestReviewDraftToolResult,
  ChangeRequestReviewDraftInput,
} from "@t3team/sdk/tools/t3teamChangeRequestReview";

import { makeT3TeamChangeRequestReviewDraftMethod } from "./t3team-workflowChangeRequestReviewDraftTool.ts";

/** Records every dispatched command instead of driving a real orchestration engine — this module
 * only needs to prove WHAT gets dispatched, not that the engine applies it (that is covered by the
 * existing draft-mutation round-trip integration test for the Jira family). */
function makeRecordingDispatch() {
  const commands: Array<OrchestrationCommand> = [];
  const dispatch = async (command: OrchestrationCommand): Promise<void> => {
    commands.push(command);
  };
  return { commands, dispatch };
}

/** Unwraps the `draft-mutation` attachment a `thread.message.upsert` command carries, failing
 * loudly if a test ever calls this on something else — that would be a bug in the test, not a
 * case to skip past silently. */
function draftFromCommand(command: OrchestrationCommand) {
  if (command.type !== "thread.message.upsert") {
    throw new Error(`Expected a thread.message.upsert command, got '${command.type}'.`);
  }
  const attachment = command.message.t3teamExt?.attachments?.[0];
  if (attachment?.kind !== "draft-mutation") {
    throw new Error("Expected the command's message to carry a draft-mutation attachment.");
  }
  return attachment.draft;
}

const singleLineInput: ChangeRequestReviewDraftInput = {
  event: "COMMENT",
  body: "Looks good overall.",
  comments: [{ path: "src/foo.ts", anchor: { kind: "line", line: 12 }, body: "Nit." }],
  replaceLatest: false,
};

const rangeInput: ChangeRequestReviewDraftInput = {
  event: "REQUEST_CHANGES",
  body: "One blocking issue.",
  comments: [
    {
      path: "src/foo.ts",
      anchor: { kind: "range", startLine: 10, line: 14 },
      body: "Extract this block.",
      suggestion: "const x = 1;",
    },
  ],
  replaceLatest: false,
};

describe("makeT3TeamChangeRequestReviewDraftMethod", () => {
  it("round-trips a single-line comment anchor through the published carrier", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    const result = await draftChangeRequestReview(singleLineInput);

    expect(commands).toHaveLength(1);
    const draft = draftFromCommand(commands[0]!);
    expect(draft.kind === "change-request-review-draft" ? draft.comments : undefined).toEqual(
      singleLineInput.comments,
    );
    expect(result).toEqual({
      ok: true,
      draftId: draft.id,
      replacesExisting: false,
      commentCount: 1,
      draft: {
        event: singleLineInput.event,
        body: singleLineInput.body,
        comments: singleLineInput.comments,
        replaceLatest: false,
      },
    });
  });

  it("round-trips a start_line..line range anchor with its suggestion intact", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    await draftChangeRequestReview(rangeInput);

    const draft = draftFromCommand(commands[0]!);
    expect(draft.kind === "change-request-review-draft" ? draft.comments : undefined).toEqual(
      rangeInput.comments,
    );
  });

  it("never dispatches anything other than a thread.message.upsert — there is no write path here", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    await draftChangeRequestReview(singleLineInput);
    await draftChangeRequestReview({ ...rangeInput, replaceLatest: true });

    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.type === "thread.message.upsert")).toBe(true);
  });

  it("preserves replaceLatest on the stored record and reports it back on the result", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    const result = (await draftChangeRequestReview({
      ...singleLineInput,
      replaceLatest: true,
    })) as CreateChangeRequestReviewDraftToolResult;

    expect(result.replacesExisting).toBe(true);
    expect(result.draft.replaceLatest).toBe(true);
    const draft = draftFromCommand(commands.at(-1)!);
    expect(draft.kind === "change-request-review-draft" ? draft.replaceLatest : undefined).toBe(
      true,
    );
  });

  it("dismisses this run's own previous pending draft carrier when replaceLatest asks to replace it", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    await draftChangeRequestReview({ ...singleLineInput, replaceLatest: false });
    const firstDraft = draftFromCommand(commands[0]!);
    expect(firstDraft.kind === "change-request-review-draft" ? firstDraft.status : undefined).toBe(
      "draft",
    );

    await draftChangeRequestReview({ ...rangeInput, replaceLatest: true });

    // publish #1, dismiss #1, publish #2 — never a second dismiss of anything else.
    expect(commands).toHaveLength(3);
    const dismissCommand = commands[1]!;
    if (dismissCommand.type !== "thread.message.upsert") {
      throw new Error("Expected the dismiss to be a thread.message.upsert.");
    }
    expect(dismissCommand.message.messageId).toBe(
      firstDraft.id.replace("change-request-review-draft:", ""),
    );
    const dismissedDraft = draftFromCommand(dismissCommand);
    expect(dismissedDraft.status).toBe("dismissed");
    // The dismissal never rewrites the proposal it settles.
    expect(
      dismissedDraft.kind === "change-request-review-draft" ? dismissedDraft.comments : undefined,
    ).toEqual(singleLineInput.comments);
  });

  it("does not dismiss a previous draft when replaceLatest is false", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    await draftChangeRequestReview({ ...singleLineInput, replaceLatest: false });
    await draftChangeRequestReview({ ...rangeInput, replaceLatest: false });

    expect(commands).toHaveLength(2);
    expect(commands.every((command) => draftFromCommand(command).status === "draft")).toBe(true);
  });

  it("falls back to an 'unknown' provider kind when no resolver is supplied", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
    });

    await draftChangeRequestReview(singleLineInput);

    const draft = draftFromCommand(commands[0]!);
    expect(draft.target).toEqual({ provider: "unknown" });
  });

  it("resolves the real provider kind when a resolver is supplied", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
      resolveProviderKind: async () => "gitlab",
    });

    await draftChangeRequestReview(singleLineInput);

    const draft = draftFromCommand(commands[0]!);
    expect(draft.target).toEqual({ provider: "gitlab" });
  });

  it("falls back to 'unknown' when the resolver rejects, rather than throwing or assuming GitHub", async () => {
    const { commands, dispatch } = makeRecordingDispatch();
    const draftChangeRequestReview = makeT3TeamChangeRequestReviewDraftMethod({
      threadId: "thread-1",
      dispatch,
      resolveProviderKind: async () => {
        throw new Error("registry resolution failed");
      },
    });

    await draftChangeRequestReview(singleLineInput);

    const draft = draftFromCommand(commands[0]!);
    expect(draft.target).toEqual({ provider: "unknown" });
  });
});
