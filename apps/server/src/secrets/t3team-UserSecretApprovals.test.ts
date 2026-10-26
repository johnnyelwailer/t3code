import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ThreadId, type UserSecretApproval, type UserSecretGrant } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  USER_SECRET_APPROVAL_TIMEOUT,
  UserSecretApprovals,
  UserSecretApprovalsLive,
} from "./t3team-UserSecretApprovals.ts";

const threadId = ThreadId.make("thread-approvals");

const grant = (approval: UserSecretApproval): UserSecretGrant => ({
  name: "API_TOKEN",
  kind: "secret",
  deliveryModes: ["processInjection"],
  destinations: [],
  approval,
});

const ask = (approval: UserSecretApproval, attended = true) =>
  Effect.gen(function* () {
    const approvals = yield* UserSecretApprovals;
    return yield* approvals.authorize({
      consumerId: threadId,
      threadId: attended ? threadId : undefined,
      grants: [grant(approval)],
      mode: "processInjection",
      command: "deploy",
      purpose: "test",
    });
  });

/** Starts `ask`, waits for its card, answers it, and returns the outcome. */
const askAndAnswer = (
  approval: UserSecretApproval,
  decision: "allowOnce" | "allowForSession" | "deny",
) =>
  Effect.gen(function* () {
    const approvals = yield* UserSecretApprovals;
    const fiber = yield* ask(approval).pipe(Effect.forkChild);
    const snapshot = yield* approvals.subscribe(threadId).pipe(
      Stream.filter((current) => current.pending.length > 0),
      Stream.runHead,
    );
    const request = snapshot._tag === "Some" ? snapshot.value.pending[0] : undefined;
    assert.isDefined(request);
    yield* approvals.answer({ threadId, approvalId: request!.id, decision });
    return { request: request!, result: yield* Fiber.join(fiber) };
  });

const layer = UserSecretApprovalsLive.pipe(Layer.provide(NodeServices.layer));

it.layer(layer)("user secret approvals", (it) => {
  it.effect("automatic and standing grants never prompt, even unattended", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* ask("automatic", false)).outcome, "allowed");
      assert.strictEqual((yield* ask("standingGrant", false)).outcome, "allowed");
    }),
  );

  it.effect("an unattended consumer is declined at once when a prompt would be needed", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* ask("oncePerSession", false)).outcome, "nobody_to_ask");
      assert.strictEqual((yield* ask("everyUse", false)).outcome, "nobody_to_ask");
    }),
  );
});

it.layer(layer)("once per session", (it) => {
  it.effect("asks once, then remembers an allow for this session", () =>
    Effect.gen(function* () {
      const first = yield* askAndAnswer("oncePerSession", "allowForSession");
      assert.strictEqual(first.result.outcome, "allowed");
      assert.isTrue(first.request.sessionApprovalAllowed);
      assert.strictEqual((yield* ask("oncePerSession")).outcome, "allowed");
    }),
  );
});

it.layer(layer)("allow once and deny", (it) => {
  it.effect("allow once is not remembered and deny declines", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        (yield* askAndAnswer("oncePerSession", "allowOnce")).result.outcome,
        "allowed",
      );
      assert.strictEqual(
        (yield* askAndAnswer("oncePerSession", "deny")).result.outcome,
        "declined",
      );
    }),
  );
});

it.layer(layer)("every use", (it) => {
  it.effect("refuses a session-wide allow and asks again each time", () =>
    Effect.gen(function* () {
      const approvals = yield* UserSecretApprovals;
      const fiber = yield* ask("everyUse").pipe(Effect.forkChild);
      const snapshot = yield* approvals.subscribe(threadId).pipe(
        Stream.filter((current) => current.pending.length > 0),
        Stream.runHead,
      );
      const request = snapshot._tag === "Some" ? snapshot.value.pending[0]! : undefined;
      assert.isFalse(request!.sessionApprovalAllowed);
      const refused = yield* Effect.flip(
        approvals.answer({ threadId, approvalId: request!.id, decision: "allowForSession" }),
      );
      assert.strictEqual(refused.reason, "session_not_allowed");
      yield* approvals.answer({ threadId, approvalId: request!.id, decision: "allowOnce" });
      assert.strictEqual((yield* Fiber.join(fiber)).outcome, "allowed");
      assert.strictEqual((yield* askAndAnswer("everyUse", "allowOnce")).result.outcome, "allowed");
    }),
  );

  it.effect("times out without an answer and clears the card", () =>
    Effect.gen(function* () {
      const approvals = yield* UserSecretApprovals;
      const fiber = yield* ask("everyUse").pipe(Effect.forkChild);
      yield* approvals.subscribe(threadId).pipe(
        Stream.filter((current) => current.pending.length > 0),
        Stream.runHead,
      );
      yield* TestClock.adjust(USER_SECRET_APPROVAL_TIMEOUT);
      assert.strictEqual((yield* Fiber.join(fiber)).outcome, "timed_out");
      const after = yield* approvals.subscribe(threadId).pipe(Stream.runHead);
      assert.strictEqual(after._tag === "Some" ? after.value.pending.length : -1, 0);
    }),
  );

  it.effect("an answer for another thread does not settle the card", () =>
    Effect.gen(function* () {
      const approvals = yield* UserSecretApprovals;
      const refused = yield* Effect.flip(
        approvals.answer({
          threadId: ThreadId.make("thread-other"),
          approvalId: "missing",
          decision: "allowOnce",
        }),
      );
      assert.strictEqual(refused.reason, "not_found");
    }),
  );
});
