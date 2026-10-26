import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  ThreadId,
  type UserSecretApproval,
  type UserSecretApprovalDecision,
  type UserSecretGrant,
} from "@t3tools/contracts";
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

const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");

const grant = (
  approval: UserSecretApproval,
  overrides: Partial<UserSecretGrant> = {},
): UserSecretGrant => ({
  name: "API_TOKEN",
  kind: "secret",
  deliveryModes: ["processInjection"],
  destinations: [],
  approval,
  ...overrides,
});

const PROMPT_FREE: ReadonlyArray<UserSecretApproval> = ["never", "standingGrant"];
const PROMPTED: ReadonlyArray<UserSecretApproval> = ["perMachine", "perThread", "everyUse"];
const REMEMBERED: ReadonlyArray<UserSecretApproval> = ["perThread", "perMachine"];

/** A use that must not prompt: it settles at once. */
const use = (entry: UserSecretGrant, thread: ThreadId | undefined) =>
  Effect.flatMap(UserSecretApprovals, (approvals) =>
    approvals.authorize({
      consumerId: thread ?? "automation-run-1",
      threadId: thread,
      grants: [entry],
      mode: "processInjection",
      command: "deploy",
      purpose: "test",
    }),
  );

/** A use that must prompt: waits for its card in `thread`, answers it, returns card and outcome. */
const prompted = (entry: UserSecretGrant, thread: ThreadId, decision: UserSecretApprovalDecision) =>
  Effect.gen(function* () {
    const approvals = yield* UserSecretApprovals;
    const fiber = yield* use(entry, thread).pipe(Effect.forkChild);
    const snapshot = yield* approvals.subscribe(thread).pipe(
      Stream.filter((current) => current.pending.length > 0),
      Stream.runHead,
    );
    const request = snapshot._tag === "Some" ? snapshot.value.pending[0] : undefined;
    if (request === undefined) return assert.fail("no approval card appeared");
    yield* approvals.answer({ threadId: thread, approvalId: request.id, decision });
    return { request, outcome: (yield* Fiber.join(fiber)).outcome };
  });

/** A fresh server process: what a restart or another machine starts from. */
const onServer = <A, E>(effect: Effect.Effect<A, E, UserSecretApprovals>) =>
  effect.pipe(
    Effect.provide(Layer.fresh(UserSecretApprovalsLive.pipe(Layer.provide(NodeServices.layer)))),
  );

describe("prompt-free policies", () => {
  it.effect("never and standingGrant do not prompt, even unattended", () =>
    onServer(
      Effect.gen(function* () {
        for (const approval of PROMPT_FREE) {
          assert.strictEqual((yield* use(grant(approval), undefined)).outcome, "allowed");
          assert.strictEqual((yield* use(grant(approval), threadA)).outcome, "allowed");
        }
      }),
    ),
  );

  it.effect("an unattended use that would need a prompt is declined at once", () =>
    onServer(
      Effect.gen(function* () {
        for (const approval of PROMPTED) {
          assert.strictEqual((yield* use(grant(approval), undefined)).outcome, "nobody_to_ask");
        }
      }),
    ),
  );
});

describe("perThread", () => {
  it.effect("offers to remember for the thread, then re-prompts in a second thread", () =>
    onServer(
      Effect.gen(function* () {
        const first = yield* prompted(grant("perThread"), threadA, "allowAndRemember");
        assert.strictEqual(first.request.rememberScope, "thread");
        assert.strictEqual(first.outcome, "allowed");
        assert.strictEqual((yield* use(grant("perThread"), threadA)).outcome, "allowed");
        assert.strictEqual(
          (yield* prompted(grant("perThread"), threadB, "allowOnce")).outcome,
          "allowed",
        );
      }),
    ),
  );

  it.effect("allow once is not remembered and deny declines", () =>
    onServer(
      Effect.gen(function* () {
        assert.strictEqual(
          (yield* prompted(grant("perThread"), threadA, "allowOnce")).outcome,
          "allowed",
        );
        assert.strictEqual(
          (yield* prompted(grant("perThread"), threadA, "deny")).outcome,
          "declined",
        );
      }),
    ),
  );
});

describe("perMachine", () => {
  it.effect("one approval covers every thread on this server, but not an unattended consumer", () =>
    onServer(
      Effect.gen(function* () {
        const first = yield* prompted(grant("perMachine"), threadA, "allowAndRemember");
        assert.strictEqual(first.request.rememberScope, "machine");
        assert.strictEqual((yield* use(grant("perMachine"), threadA)).outcome, "allowed");
        assert.strictEqual((yield* use(grant("perMachine"), threadB)).outcome, "allowed");
        assert.strictEqual((yield* use(grant("perMachine"), undefined)).outcome, "nobody_to_ask");
      }),
    ),
  );

  it.effect("mixed with a perThread entry, remembering reaches only the thread", () =>
    onServer(
      Effect.gen(function* () {
        const approvals = yield* UserSecretApprovals;
        const both = [grant("perMachine"), grant("perThread", { name: "OTHER_TOKEN" })];
        const ask = (thread: ThreadId) =>
          approvals.authorize({
            consumerId: thread,
            threadId: thread,
            grants: both,
            mode: "processInjection",
            purpose: "test",
          });
        const fiber = yield* ask(threadA).pipe(Effect.forkChild);
        const snapshot = yield* approvals.subscribe(threadA).pipe(
          Stream.filter((current) => current.pending.length > 0),
          Stream.runHead,
        );
        const request = snapshot._tag === "Some" ? snapshot.value.pending[0] : undefined;
        if (request === undefined) return assert.fail("no approval card appeared");
        assert.strictEqual(request.rememberScope, "thread");
        yield* approvals.answer({
          threadId: threadA,
          approvalId: request.id,
          decision: "allowAndRemember",
        });
        yield* Fiber.join(fiber);
        assert.strictEqual((yield* use(grant("perMachine"), threadA)).outcome, "allowed");
        yield* prompted(grant("perMachine"), threadB, "allowOnce");
      }),
    ),
  );
});

describe("nothing remembered reaches past one server and one policy", () => {
  it.effect("a restart or another machine asks again, for perThread and perMachine", () =>
    Effect.gen(function* () {
      for (const approval of REMEMBERED) {
        yield* onServer(prompted(grant(approval), threadA, "allowAndRemember"));
        const again = yield* onServer(prompted(grant(approval), threadA, "allowOnce"));
        assert.strictEqual(again.outcome, "allowed");
      }
    }),
  );

  it.effect("a changed or revoked entry policy asks again, for perThread and perMachine", () =>
    onServer(
      Effect.gen(function* () {
        for (const approval of REMEMBERED) {
          yield* prompted(grant(approval), threadA, "allowAndRemember");
          assert.strictEqual((yield* use(grant(approval), threadA)).outcome, "allowed");
          yield* prompted(
            grant(approval, { destinations: ["new.example.com"] }),
            threadA,
            "allowOnce",
          );
          yield* prompted(
            grant(approval, { expiresAt: "2026-12-31T00:00:00.000Z" }),
            threadA,
            "allowOnce",
          );
        }
      }),
    ),
  );
});

describe("everyUse", () => {
  it.effect("offers no remember, refuses one, and asks again each time", () =>
    onServer(
      Effect.gen(function* () {
        const approvals = yield* UserSecretApprovals;
        const fiber = yield* use(grant("everyUse"), threadA).pipe(Effect.forkChild);
        const snapshot = yield* approvals.subscribe(threadA).pipe(
          Stream.filter((current) => current.pending.length > 0),
          Stream.runHead,
        );
        const request = snapshot._tag === "Some" ? snapshot.value.pending[0] : undefined;
        if (request === undefined) return assert.fail("no approval card appeared");
        assert.isUndefined(request.rememberScope);
        const refused = yield* Effect.flip(
          approvals.answer({
            threadId: threadA,
            approvalId: request.id,
            decision: "allowAndRemember",
          }),
        );
        assert.strictEqual(refused.reason, "remember_not_allowed");
        yield* approvals.answer({
          threadId: threadA,
          approvalId: request.id,
          decision: "allowOnce",
        });
        assert.strictEqual((yield* Fiber.join(fiber)).outcome, "allowed");
        yield* prompted(grant("everyUse"), threadA, "allowOnce");
      }),
    ),
  );

  it.effect("times out without an answer and clears the card", () =>
    onServer(
      Effect.gen(function* () {
        const approvals = yield* UserSecretApprovals;
        const fiber = yield* use(grant("everyUse"), threadA).pipe(Effect.forkChild);
        yield* approvals.subscribe(threadA).pipe(
          Stream.filter((current) => current.pending.length > 0),
          Stream.runHead,
        );
        yield* TestClock.adjust(USER_SECRET_APPROVAL_TIMEOUT);
        assert.strictEqual((yield* Fiber.join(fiber)).outcome, "timed_out");
        const after = yield* approvals.subscribe(threadA).pipe(Stream.runHead);
        assert.strictEqual(after._tag === "Some" ? after.value.pending.length : -1, 0);
      }),
    ),
  );

  it.effect("an answer for another thread does not settle a card", () =>
    onServer(
      Effect.gen(function* () {
        const approvals = yield* UserSecretApprovals;
        const refused = yield* Effect.flip(
          approvals.answer({ threadId: threadB, approvalId: "missing", decision: "allowOnce" }),
        );
        assert.strictEqual(refused.reason, "not_found");
      }),
    ),
  );
});
