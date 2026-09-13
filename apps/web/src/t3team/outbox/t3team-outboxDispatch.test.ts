import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  dispatchT3TeamOutboxEntry,
  type T3TeamOutboxDispatchDeps,
  type T3TeamOutboxDispatchOutcome,
} from "~/t3team/outbox/t3team-outboxDispatch";
import { makeT3TeamOutboxEntry, type T3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxModel";

function turnStartEntry(messageId = "m-1") {
  return makeT3TeamOutboxEntry(
    "turn-start",
    {
      messageId,
      messageText: "hello",
      modelSelection: null,
      titleSeed: "hello",
      runtimeMode: "full-access" as never,
      interactionMode: "default" as never,
      createdAt: "2026-09-13T00:00:00.000Z",
    },
    "env-a",
    "thread-a",
  );
}

function workflowAnswerEntry(messageId = "m-1") {
  return makeT3TeamOutboxEntry(
    "workflow-answer",
    { messageId, text: "yes", value: undefined, correlationId: null },
    "env-a",
    "thread-a",
  );
}

function cardActionEntry() {
  return makeT3TeamOutboxEntry(
    "recipe-card-action",
    { cardId: "card-1", actionId: "run", submit: null },
    "env-a",
    "thread-a",
  );
}

interface FakeDeps {
  deps: T3TeamOutboxDispatchDeps;
  startTurn: ReturnType<typeof vi.fn>;
  resolveWorkflowInput: ReturnType<typeof vi.fn>;
  submitRecipeCardAction: ReturnType<typeof vi.fn>;
  launchStagedAction: ReturnType<typeof vi.fn>;
}

function fakeDeps(
  overrides: {
    seen?: boolean | null;
    startTurnResult?: unknown;
  } = {},
): FakeDeps {
  const startTurn = vi
    .fn()
    .mockResolvedValue(overrides.startTurnResult ?? AsyncResult.success(undefined));
  const resolveWorkflowInput = vi.fn().mockResolvedValue(undefined);
  const submitRecipeCardAction = vi.fn().mockResolvedValue({ ok: true });
  const launchStagedAction = vi.fn().mockResolvedValue(true);
  const deps: T3TeamOutboxDispatchDeps = {
    startTurn: (request) => startTurn(request) as Promise<never>,
    resolveWorkflowInput: (request) => resolveWorkflowInput(request),
    submitRecipeCardAction: (request) => submitRecipeCardAction(request),
    launchStagedAction: (payload) => launchStagedAction(payload),
    threadHasUserMessage: () => ("seen" in overrides ? overrides.seen : false),
  };
  return { deps, startTurn, resolveWorkflowInput, submitRecipeCardAction, launchStagedAction };
}

function run(entry: T3TeamOutboxEntry, fake: FakeDeps): Promise<T3TeamOutboxDispatchOutcome> {
  return dispatchT3TeamOutboxEntry(entry, fake.deps);
}

describe("turn-start dispatch", () => {
  it("discards the entry when the read model already holds the message (lost ACK)", async () => {
    const fake = fakeDeps({ seen: true });
    const outcome = await run(turnStartEntry(), fake);
    expect(outcome).toEqual({ outcome: "delivered" });
    expect(fake.startTurn).not.toHaveBeenCalled();
  });

  it("defers while the read model has not loaded", async () => {
    const fake = fakeDeps({ seen: null });
    const outcome = await run(turnStartEntry(), fake);
    expect(outcome).toEqual({ outcome: "retry" });
    expect(fake.startTurn).not.toHaveBeenCalled();
  });

  it("posts the turn with the queued message id when unseen", async () => {
    const fake = fakeDeps({ seen: false });
    const outcome = await run(turnStartEntry("m-42"), fake);
    expect(outcome).toEqual({ outcome: "delivered" });
    expect(fake.startTurn).toHaveBeenCalledWith({
      environmentId: "env-a",
      input: {
        threadId: "thread-a",
        message: { messageId: "m-42", role: "user", text: "hello", attachments: [] },
        titleSeed: "hello",
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: "2026-09-13T00:00:00.000Z",
      },
    });
  });

  it("retries on transport-level socket failures", async () => {
    const fake = fakeDeps({
      seen: false,
      startTurnResult: AsyncResult.failure(Cause.fail(new Error("Socket is not connected"))),
    });
    const outcome = await run(turnStartEntry(), fake);
    expect(outcome).toEqual({ outcome: "retry" });
  });

  it("fails permanently on server-answered rejections", async () => {
    const fake = fakeDeps({
      seen: false,
      startTurnResult: AsyncResult.failure(
        Cause.fail(new Error("Thread 'thread-a' already has a turn in progress.")),
      ),
    });
    const outcome = await run(turnStartEntry(), fake);
    expect(outcome.outcome).toBe("failed");
    if (outcome.outcome === "failed") {
      expect(outcome.error).toContain("already has a turn in progress");
    }
  });
});

describe("workflow-answer dispatch", () => {
  it("discards the answer when its optimistic message was already posted", async () => {
    const fake = fakeDeps({ seen: true });
    const outcome = await run(workflowAnswerEntry(), fake);
    expect(outcome).toEqual({ outcome: "delivered" });
    expect(fake.resolveWorkflowInput).not.toHaveBeenCalled();
  });

  it("defers while the read model has not loaded", async () => {
    const fake = fakeDeps({ seen: null });
    expect(await run(workflowAnswerEntry(), fake)).toEqual({ outcome: "retry" });
  });

  it("posts the answer and omits absent value/correlation", async () => {
    const fake = fakeDeps({ seen: false });
    const outcome = await run(workflowAnswerEntry("m-7"), fake);
    expect(outcome).toEqual({ outcome: "delivered" });
    expect(fake.resolveWorkflowInput).toHaveBeenCalledWith({
      threadId: "thread-a",
      text: "yes",
      messageId: "m-7",
    });
  });

  it("retries on connectivity failures, fails on validation rejections", async () => {
    const transient = fakeDeps({ seen: false });
    transient.resolveWorkflowInput.mockRejectedValue(
      new Error(
        "Failed to reach backend /api/t3team/thread/workflow/resolve-input at x. Fetch error: Failed to fetch.",
      ),
    );
    expect(await run(workflowAnswerEntry(), transient)).toEqual({ outcome: "retry" });

    const permanent = fakeDeps({ seen: false });
    permanent.resolveWorkflowInput.mockRejectedValue(
      new Error("No pending user input on thread 'thread-a'."),
    );
    const outcome = await run(workflowAnswerEntry(), permanent);
    expect(outcome.outcome).toBe("failed");
  });
});

describe("recipe-card-action dispatch", () => {
  it("posts the card action and delivers on success", async () => {
    const fake = fakeDeps();
    const outcome = await run(cardActionEntry(), fake);
    expect(outcome).toEqual({ outcome: "delivered" });
    expect(fake.submitRecipeCardAction).toHaveBeenCalledWith({
      threadId: "thread-a",
      cardId: "card-1",
      actionId: "run",
    });
  });

  it("retries on connectivity failures", async () => {
    const fake = fakeDeps();
    fake.submitRecipeCardAction.mockRejectedValue(
      new Error("Failed to reach backend /api/t3team/thread/recipe-workflow/card-action at x."),
    );
    expect(await run(cardActionEntry(), fake)).toEqual({ outcome: "retry" });
  });
});

describe("staged-action dispatch", () => {
  it("launches the staged action with the queued snapshot", async () => {
    const fake = fakeDeps();
    const entry = makeT3TeamOutboxEntry(
      "staged-action",
      {
        action: { selectedRecipe: { id: "recipe-1" }, comments: [] } as never,
        composerText: "note",
        modelSelection: null,
        runtimeMode: "full-access" as never,
        interactionMode: "default" as never,
      },
      "env-a",
      "thread-a",
    );
    const outcome = await run(entry, fake);
    expect(outcome).toEqual({ outcome: "delivered" });
    expect(fake.launchStagedAction).toHaveBeenCalledWith(entry.payload);
  });
});
