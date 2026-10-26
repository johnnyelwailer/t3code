/**
 * Approval for using a user secret, decided by the user in the app and never by an agent: the
 * pending approval is answered only through the client RPC (`userSecrets.answerApproval`), which
 * no agent tool reaches; `t3_pending_request_respond` answers thread questions, not these.
 *
 * Approvals live only while the asking tool call waits, so they are kept in memory. "Allow for this
 * session" is remembered per consumer for the names it covered, until the server stops.
 *
 * Nothing here assumes a user at the keyboard. `automatic` and `standingGrant` uses never prompt; a
 * consumer without a thread to ask in (an unattended run) is declined at once for any use that
 * would need a prompt, rather than waiting for an answer nobody can give.
 */
import {
  UserSecretApprovalAnswerError,
  type UserSecretApprovalAnswerInput,
  type UserSecretApprovalDecision,
  type UserSecretApprovalRequest,
  type UserSecretApprovalsSnapshot,
  type UserSecretApproval,
  type UserSecretDeliveryMode,
  type UserSecretGrant,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { needsPrompt, strictestApproval } from "./t3team-userSecretGrants.ts";

export const USER_SECRET_APPROVAL_TIMEOUT = Duration.minutes(5);

export interface UserSecretAuthorizeInput {
  /** Who uses the secret: a thread id, or an automation run id on another host. */
  readonly consumerId: string;
  /** Where to ask the user; undefined for an unattended consumer. */
  readonly threadId: ThreadId | undefined;
  readonly grants: ReadonlyArray<UserSecretGrant>;
  readonly mode: UserSecretDeliveryMode;
  readonly command?: string | undefined;
  readonly destination?: string | undefined;
  readonly purpose: string;
}

export interface UserSecretAuthorization {
  readonly outcome: "allowed" | "declined" | "timed_out" | "nobody_to_ask";
  readonly approval: UserSecretApproval;
}

interface Pending {
  readonly request: UserSecretApprovalRequest;
  readonly decision: Deferred.Deferred<UserSecretApprovalDecision>;
}

export class UserSecretApprovals extends Context.Service<
  UserSecretApprovals,
  {
    readonly authorize: (input: UserSecretAuthorizeInput) => Effect.Effect<UserSecretAuthorization>;
    readonly subscribe: (threadId: ThreadId) => Stream.Stream<UserSecretApprovalsSnapshot>;
    readonly answer: (
      input: UserSecretApprovalAnswerInput,
    ) => Effect.Effect<void, UserSecretApprovalAnswerError>;
  }
>()("t3/secrets/t3team-UserSecretApprovals/UserSecretApprovals") {}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const pending = yield* SubscriptionRef.make<ReadonlyMap<string, Pending>>(new Map());
  const sessionApproved = new Map<string, Set<string>>();

  const coveredBySession = (consumerId: string, grants: ReadonlyArray<UserSecretGrant>) =>
    grants.every(
      (grant) =>
        !needsPrompt(grant.approval) ||
        (grant.approval === "oncePerSession" && sessionApproved.get(consumerId)?.has(grant.name)),
    );

  const rememberForSession = (consumerId: string, grants: ReadonlyArray<UserSecretGrant>) => {
    const names = sessionApproved.get(consumerId) ?? new Set<string>();
    for (const grant of grants) names.add(grant.name);
    sessionApproved.set(consumerId, names);
  };

  const withoutId = (id: string) =>
    SubscriptionRef.update(pending, (current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });

  const authorize: UserSecretApprovals["Service"]["authorize"] = Effect.fn(
    "UserSecretApprovals.authorize",
  )(function* (input) {
    const approval = strictestApproval(input.grants);
    const decided = (outcome: UserSecretAuthorization["outcome"]) => ({ outcome, approval });
    yield* Effect.annotateCurrentSpan({ "user_secret.approval": approval });
    if (coveredBySession(input.consumerId, input.grants)) return decided("allowed");
    const threadId = input.threadId;
    if (threadId === undefined) return decided("nobody_to_ask");
    const id = yield* crypto.randomUUIDv4().pipe(Effect.orDie);
    const decision = yield* Deferred.make<UserSecretApprovalDecision>();
    const request: UserSecretApprovalRequest = {
      id,
      threadId,
      secretNames: input.grants.map((grant) => grant.name),
      mode: input.mode,
      ...(input.command === undefined ? {} : { command: input.command }),
      ...(input.destination === undefined ? {} : { destination: input.destination }),
      purpose: input.purpose,
      sessionApprovalAllowed: approval !== "everyUse",
      requestedAt: DateTime.formatIso(yield* DateTime.now),
    };
    yield* SubscriptionRef.update(pending, (current) =>
      new Map(current).set(id, { request, decision }),
    );
    const answered = yield* Deferred.await(decision).pipe(
      Effect.timeoutOption(USER_SECRET_APPROVAL_TIMEOUT),
      Effect.ensuring(withoutId(id)),
    );
    if (Option.isNone(answered)) return decided("timed_out");
    if (answered.value === "deny") return decided("declined");
    if (answered.value === "allowForSession") rememberForSession(input.consumerId, input.grants);
    return decided("allowed");
  });

  const subscribe: UserSecretApprovals["Service"]["subscribe"] = (threadId) =>
    SubscriptionRef.changes(pending).pipe(
      Stream.map((current) => ({
        pending: [...current.values()]
          .map((entry) => entry.request)
          .filter((request) => request.threadId === threadId),
      })),
    );

  const answer: UserSecretApprovals["Service"]["answer"] = Effect.fn("UserSecretApprovals.answer")(
    function* (input) {
      const entry = (yield* SubscriptionRef.get(pending)).get(input.approvalId);
      if (entry === undefined || entry.request.threadId !== input.threadId) {
        return yield* new UserSecretApprovalAnswerError({ reason: "not_found" });
      }
      if (input.decision === "allowForSession" && !entry.request.sessionApprovalAllowed) {
        return yield* new UserSecretApprovalAnswerError({ reason: "session_not_allowed" });
      }
      yield* Deferred.succeed(entry.decision, input.decision);
    },
  );

  return UserSecretApprovals.of({ authorize, subscribe, answer });
});

export const UserSecretApprovalsLive = Layer.effect(UserSecretApprovals, make);
