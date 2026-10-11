/**
 * Project-scoped hold for a repository secret the user entered but could not write as an Actions
 * secret (no admin). Values ride the next cloud-session grant's secrets bag into SECRETS_DIR so
 * the session is unblocked; they are not durable for the team until an admin sets the Actions secret.
 *
 * @module t3team-repositorySecretPending
 */
import type { ProjectId } from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ServerSecretStore from "./auth/ServerSecretStore.ts";

const TTL_MS = 24 * 60 * 60 * 1000;
const SECRET_NAME = /^(?!GITHUB_)[A-Z_][A-Z0-9_]*$/;
const RESERVED = new Set(["GIT_TOKEN", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL"]);

const PendingBag = Schema.fromJsonString(
  Schema.Struct({
    secrets: Schema.Record(Schema.String, Schema.String),
    updatedAt: Schema.Number,
  }),
);
const encodeBag = Schema.encodeEffect(PendingBag);
const decodeBag = Schema.decodeUnknownOption(PendingBag);

const storeKey = (projectId: ProjectId) =>
  `repo-secret-pending-${NodeCrypto.createHash("sha256").update(projectId).digest("hex").slice(0, 32)}`;

const emptyBag = () => ({ secrets: {} as Record<string, string>, updatedAt: 0 });

const readBag = (projectId: ProjectId) =>
  Effect.gen(function* () {
    const store = yield* ServerSecretStore.ServerSecretStore;
    const bytes = yield* store
      .get(storeKey(projectId))
      .pipe(Effect.orElseSucceed(() => Option.none()));
    if (Option.isNone(bytes)) return emptyBag();
    const decoded = decodeBag(new TextDecoder().decode(bytes.value));
    if (Option.isNone(decoded)) return emptyBag();
    if (Date.now() - decoded.value.updatedAt > TTL_MS) {
      yield* store.remove(storeKey(projectId)).pipe(Effect.ignore);
      return emptyBag();
    }
    return {
      secrets: { ...decoded.value.secrets },
      updatedAt: decoded.value.updatedAt,
    };
  });

const writeBag = (
  projectId: ProjectId,
  bag: { readonly secrets: Record<string, string>; readonly updatedAt: number },
) =>
  Effect.gen(function* () {
    const store = yield* ServerSecretStore.ServerSecretStore;
    const json = yield* encodeBag(bag);
    yield* store.set(storeKey(projectId), new TextEncoder().encode(json));
  });

/** Keep one secret for the project's next cloud session(s) within the TTL. */
export const holdRepositorySecretPending = Effect.fn("holdRepositorySecretPending")(
  function* (input: {
    readonly projectId: ProjectId;
    readonly name: string;
    readonly value: string;
  }) {
    if (!SECRET_NAME.test(input.name) || RESERVED.has(input.name)) {
      return yield* Effect.fail("That secret name cannot be held for a session.");
    }
    const bag = yield* readBag(input.projectId);
    bag.secrets[input.name] = input.value;
    yield* writeBag(input.projectId, { secrets: bag.secrets, updatedAt: Date.now() });
  },
);

/** Drop a held secret after a durable Actions write succeeds. */
export const clearRepositorySecretPending = Effect.fn("clearRepositorySecretPending")(
  function* (input: { readonly projectId: ProjectId; readonly name: string }) {
    const bag = yield* readBag(input.projectId);
    if (!(input.name in bag.secrets)) return;
    delete bag.secrets[input.name];
    if (Object.keys(bag.secrets).length === 0) {
      const store = yield* ServerSecretStore.ServerSecretStore;
      yield* store.remove(storeKey(input.projectId)).pipe(Effect.ignore);
      return;
    }
    yield* writeBag(input.projectId, { secrets: bag.secrets, updatedAt: Date.now() });
  },
);

/**
 * Pending secrets to merge into a broker grant/claim secrets bag. Never overwrites reserved
 * credential keys already on the bag.
 */
export const pendingRepositorySecretsForGrant = Effect.fn("pendingRepositorySecretsForGrant")(
  function* (projectId: ProjectId) {
    const bag = yield* readBag(projectId);
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(bag.secrets)) {
      if (SECRET_NAME.test(name) && !RESERVED.has(name) && value.length > 0) out[name] = value;
    }
    return out;
  },
);

/** Pending first, then base — so GIT_* and other grant credentials always win. */
export const mergeSecretsWithPending = (
  base: Readonly<Record<string, string>> | undefined,
  pending: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined => {
  if (Object.keys(pending).length === 0) return base;
  return { ...pending, ...(base ?? {}) };
};
