/**
 * My Work is the first surface on the generic view-arrangement store
 * (`t3team-viewArrangement.ts`). Live plans still mirror the legacy digest table so the
 * existing arrange recipe and "Back to default" keep working. Drafts live only in the
 * generic store, keyed by surface `project.dashboard.myWork`.
 */
import * as Effect from "effect/Effect";

import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";
import {
  clearDigestArrangement,
  digestArrangementKey,
  readDigestArrangement,
  storeDigestArrangement,
} from "./t3team-myworkDigestArrangement.ts";
import { validateDigestPlan } from "./t3team-myworkDigestArrangementValidate.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
} from "./t3team-myworkDigestTypes.ts";
import {
  deleteViewArrangement,
  readViewArrangement,
  storeViewArrangement,
  T3TeamViewArrangementError,
  type ViewArrangementChannel,
} from "./t3team-viewArrangement.ts";

export const MY_WORK_ARRANGEMENT_SURFACE = "project.dashboard.myWork";

const viewKey = (
  identity: T3TeamBacklogCacheIdentity,
  scope: string,
  channel: ViewArrangementChannel,
) => ({
  identity: { provider: identity.provider, accountId: identity.accountId },
  surface: MY_WORK_ARRANGEMENT_SURFACE,
  scope,
  channel,
});

const validated = (plan: unknown) =>
  validateDigestPlan(plan).pipe(Effect.orElseSucceed(() => null));

export function readDigestDraft(identity: T3TeamBacklogCacheIdentity, scope: string) {
  return Effect.gen(function* () {
    const stored = yield* readViewArrangement(viewKey(identity, scope, "draft"));
    if (stored === null) return null;
    return yield* validated(stored);
  });
}

export function storeDigestDraft(
  identity: T3TeamBacklogCacheIdentity,
  scope: string,
  plan: unknown,
) {
  return Effect.gen(function* () {
    const valid = yield* validateDigestPlan(plan);
    yield* storeViewArrangement(viewKey(identity, scope, "draft"), valid);
    return valid;
  });
}

/** Live write: generic store and the legacy digest table, same plan. */
export function storeMyWorkLiveArrangement(
  identity: T3TeamBacklogCacheIdentity,
  scope: string,
  plan: unknown,
) {
  return Effect.gen(function* () {
    const valid = yield* validateDigestPlan(plan);
    yield* storeViewArrangement(viewKey(identity, scope, "live"), valid);
    return yield* storeDigestArrangement(identity, scope, valid);
  });
}

export function discardDigestDraft(identity: T3TeamBacklogCacheIdentity, scope: string) {
  return deleteViewArrangement(viewKey(identity, scope, "draft"));
}

export function promoteDigestDraft(identity: T3TeamBacklogCacheIdentity, scope: string) {
  return Effect.gen(function* () {
    const draft = yield* readDigestDraft(identity, scope);
    if (draft === null) {
      return yield* new T3TeamViewArrangementError({ reason: "No draft arrangement to promote." });
    }
    const stored = yield* storeMyWorkLiveArrangement(identity, scope, draft);
    yield* discardDigestDraft(identity, scope);
    return stored;
  });
}

export function resetDigestArrangement(identity: T3TeamBacklogCacheIdentity, scope: string) {
  return Effect.gen(function* () {
    yield* clearDigestArrangement(identity, scope);
    yield* deleteViewArrangement(viewKey(identity, scope, "live"));
    yield* discardDigestDraft(identity, scope);
  }).pipe(Effect.asVoid);
}

const livePlan = (identity: T3TeamBacklogCacheIdentity, scope: string) =>
  Effect.gen(function* () {
    const generic = yield* readViewArrangement(viewKey(identity, scope, "live"));
    if (generic !== null) {
      const valid = yield* validated(generic);
      if (valid !== null) return valid;
    }
    return yield* readDigestArrangement(identity, scope);
  });

/** Stamp live (generic, else legacy) and draft onto the digest payload. */
export function attachDigestArrangementOverlay(
  input: T3TeamMyWorkDigestInput,
  payload: T3TeamMyWorkDigestPayload,
) {
  return Effect.gen(function* () {
    const key = digestArrangementKey(input);
    if (key === undefined) return payload;
    const arrangement = yield* livePlan(key.identity, key.scope);
    const draftArrangement = yield* readDigestDraft(key.identity, key.scope);
    return {
      ...payload,
      ...(arrangement === null ? {} : { arrangement }),
      ...(draftArrangement === null ? {} : { draftArrangement }),
    };
  });
}
