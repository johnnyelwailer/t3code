/**
 * Grants a running session gains when the user approves an agent's request (`request_secret` with a
 * `use` block): the session-scoped counterpart of the grants a session starts with. Memory only, so a
 * restart forgets them, like every approval. A name the session was started with is never replaced,
 * and a login slot never registers.
 */
import type { UserSecretGrant, UserSecretName, UserSecretRequestUse } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

export class RequestedUserSecretRefused extends Schema.TaggedError<RequestedUserSecretRefused>()(
  "RequestedUserSecretRefused",
  { name: Schema.String, reason: Schema.Literals(["already_granted", "login_slot"]) },
) {
  override get message(): string {
    return this.reason === "already_granted"
      ? `${this.name} was granted when this session started; use that grant.`
      : `${this.name} is a provider login and cannot be requested.`;
  }
}

export interface RequestedUserSecretSummary {
  readonly name: string;
  readonly approval: UserSecretGrant["approval"];
  readonly deliveryModes: UserSecretGrant["deliveryModes"];
  readonly destinations: UserSecretGrant["destinations"];
  readonly expiresAt: string | undefined;
}

export interface RequestedUserSecretEntry {
  readonly grant: UserSecretGrant;
  readonly value: Redacted.Redacted<string>;
}

export interface PendingCredentialRequest {
  readonly turnItemId: string;
  readonly use: UserSecretRequestUse;
}

export class RequestedUserSecrets extends Context.Service<
  RequestedUserSecrets,
  {
    /** Refuses early, before the user is asked for a value that could not be registered. */
    readonly check: (name: UserSecretName) => Effect.Effect<void, RequestedUserSecretRefused>;
    readonly register: (
      grant: UserSecretGrant,
      value: Redacted.Redacted<string>,
    ) => Effect.Effect<void, RequestedUserSecretRefused>;
    /** True when a grant existed. The value is dropped with it. */
    readonly revoke: (name: UserSecretName) => Effect.Effect<boolean>;
    /** What was granted, for the card and for revoking; never a value. */
    readonly list: Effect.Effect<ReadonlyArray<RequestedUserSecretSummary>>;
    /** Pending requests and grants for a thread, emitted again whenever either changes. */
    readonly subscribe: (threadId: string) => Stream.Stream<{
      readonly pending: ReadonlyArray<PendingCredentialRequest>;
      readonly granted: ReadonlyArray<RequestedUserSecretSummary>;
    }>;
    /** A request whose card is waiting for the user, so the card can show what is asked. */
    readonly trackPending: (input: {
      readonly threadId: string;
      readonly turnItemId: string;
      readonly use: UserSecretRequestUse;
    }) => Effect.Effect<void>;
    readonly pendingFor: (
      threadId: string,
    ) => Effect.Effect<ReadonlyArray<PendingCredentialRequest>>;
    readonly untrack: (turnItemId: string) => Effect.Effect<void>;
    /** Synchronous, for the resolver port's `grant`; the value only leaves through `resolve`. */
    readonly lookup: (name: string) => RequestedUserSecretEntry | undefined;
  }
>()("t3/secrets/t3team-RequestedUserSecrets/RequestedUserSecrets") {}

const LOGIN_SLOT_NAME_PREFIX = "AUTH_SLOT_";

export function makeRequestedUserSecrets(options: {
  /** True for a name the session's own grants already cover. */
  readonly reserved: (name: string) => boolean;
  /** Bumped on every change, so `subscribe` can push a new snapshot. Absent: `subscribe` emits once. */
  readonly versions?: SubscriptionRef.SubscriptionRef<number>;
}): RequestedUserSecrets["Service"] {
  const entries = new Map<string, RequestedUserSecretEntry>();
  const pending = new Map<
    string,
    { readonly threadId: string; readonly use: UserSecretRequestUse }
  >();
  const bump =
    options.versions === undefined
      ? Effect.void
      : SubscriptionRef.update(options.versions, (n) => n + 1);
  const check = (name: string) =>
    name.startsWith(LOGIN_SLOT_NAME_PREFIX)
      ? Effect.fail(new RequestedUserSecretRefused({ name, reason: "login_slot" }))
      : options.reserved(name)
        ? Effect.fail(new RequestedUserSecretRefused({ name, reason: "already_granted" }))
        : Effect.void;
  const list = Effect.sync(() =>
    [...entries.values()].map(({ grant }) => ({
      name: grant.name,
      approval: grant.approval,
      deliveryModes: grant.deliveryModes,
      destinations: grant.destinations,
      expiresAt: grant.expiresAt,
    })),
  );
  const pendingFor = (threadId: string) =>
    Effect.sync(() =>
      [...pending.entries()]
        .filter(([, request]) => request.threadId === threadId)
        .map(([turnItemId, request]) => ({ turnItemId, use: request.use })),
    );
  const snapshot = (threadId: string) =>
    Effect.all({ pending: pendingFor(threadId), granted: list });
  return RequestedUserSecrets.of({
    check,
    register: (grant, value) =>
      check(grant.name).pipe(
        Effect.andThen(Effect.sync(() => void entries.set(grant.name, { grant, value }))),
        Effect.andThen(bump),
      ),
    revoke: (name) => Effect.sync(() => entries.delete(name)).pipe(Effect.tap(() => bump)),
    list,
    subscribe: (threadId) =>
      options.versions === undefined
        ? Stream.fromEffect(snapshot(threadId))
        : SubscriptionRef.changes(options.versions).pipe(
            Stream.mapEffect(() => snapshot(threadId)),
          ),
    trackPending: ({ threadId, turnItemId, use }) =>
      Effect.sync(() => void pending.set(turnItemId, { threadId, use })).pipe(Effect.andThen(bump)),
    pendingFor,
    untrack: (turnItemId) =>
      Effect.sync(() => void pending.delete(turnItemId)).pipe(Effect.andThen(bump)),
    lookup: (name) => entries.get(name),
  });
}
