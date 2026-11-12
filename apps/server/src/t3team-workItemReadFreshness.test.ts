import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  fresherRow,
  liveFreshness,
  mirrorAnswerFreshness,
  toMirrorFreshness,
} from "./t3team-workItemReadFreshness.ts";
import { makeWorkItemReadService, type WorkItemReadPort } from "./t3team-workItemReadService.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

const binding: JiraMirrorBinding = {
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId: "10001",
};
const SYNCED_AT_MS = Date.UTC(2026, 10, 2, 8, 0, 0);

const row = (extra: Record<string, unknown> = {}) => ({
  provider: "atlassian",
  displayId: "IES-1",
  id: "IES-1",
  title: "Title",
  status: "Open",
  ...extra,
});

it("a mirror answer names its sync time and whether the sync has failed since", () => {
  assert.deepEqual(mirrorAnswerFreshness({ syncedAtMs: SYNCED_AT_MS, stale: false }), {
    source: "mirror",
    syncedAt: "2026-11-02T08:00:00.000Z",
  });
  assert.deepEqual(mirrorAnswerFreshness({ syncedAtMs: SYNCED_AT_MS, stale: true }), {
    source: "mirror",
    syncedAt: "2026-11-02T08:00:00.000Z",
    stale: true,
  });
  assert.deepEqual(mirrorAnswerFreshness({ syncedAtMs: undefined, stale: false }), {
    source: "mirror",
  });
  assert.deepEqual(liveFreshness, { source: "live" });
});

it("the sync state maps to freshness: any recorded error means stale", () => {
  assert.deepEqual(toMirrorFreshness({ lastSuccessAtMs: 5, lastError: undefined }), {
    syncedAtMs: 5,
    stale: false,
  });
  assert.deepEqual(toMirrorFreshness({ lastSuccessAtMs: undefined, lastError: "401" }), {
    syncedAtMs: undefined,
    stale: true,
  });
});

it("get answers from the tracker's row only when it is demonstrably newer", () => {
  const mirrorRow = row({ updatedAt: "2026-11-02T08:00:00.000+0000", description: "mirror" });
  const sameInstant = row({ updatedAt: "2026-11-02T09:00:00.000+0100", description: "live" });
  const later = row({ updatedAt: "2026-11-02T10:30:00.000+0100", description: "live" });
  assert.equal(fresherRow(mirrorRow, later).source, "live");
  assert.equal(fresherRow(mirrorRow, sameInstant).source, "mirror");
  assert.equal(fresherRow(mirrorRow, mirrorRow).source, "mirror");
  assert.equal(fresherRow(null, later).source, "live");
});

it("unreadable times keep the mirror row unless only the tracker's time reads", () => {
  const dated = row({ updatedAt: "2026-11-02T08:00:00.000+0000" });
  const undated = row();
  const garbled = row({ updatedAt: "yesterday" });
  assert.equal(fresherRow(undated, undated).source, "mirror");
  assert.equal(fresherRow(garbled, undated).source, "mirror");
  assert.equal(fresherRow(dated, undated).source, "mirror");
  assert.equal(fresherRow(undated, dated).source, "live");
  assert.equal(fresherRow(garbled, dated).source, "live");
});

const makePort = (input: {
  readonly mirror?: ReadonlyArray<Record<string, unknown>> | "unsynced";
  readonly live?: ReadonlyArray<Record<string, unknown>>;
  readonly sync?: { readonly syncedAtMs: number | undefined; readonly stale: boolean };
}) => {
  const mirror = input.mirror === "unsynced" ? [] : (input.mirror ?? []);
  const port: WorkItemReadPort = {
    mirrorReady: () => Effect.succeed(input.mirror !== "unsynced"),
    mirrorFreshness: () => Effect.succeed(input.sync ?? { syncedAtMs: SYNCED_AT_MS, stale: false }),
    mirrorSearch: (_b, _filters, limit, offset) =>
      Effect.succeed(mirror.slice(offset, offset + limit)),
    mirrorGet: (_b, key) =>
      Effect.succeed(mirror.find((entry) => entry["displayId"] === key) ?? null),
    mirrorChildren: () => Effect.succeed([]),
    searchLive: () => Effect.succeed({ items: input.live ?? [], nextCursor: undefined }),
    comments: () => Effect.succeed({ comments: [], truncated: false }),
  };
  return makeWorkItemReadService(port);
};

it.effect("search says its answer is the mirror, with the last sync time", () =>
  Effect.gen(function* () {
    const service = makePort({ mirror: [row()] });
    const result = yield* service.search(binding, { status: ["Open"] });
    assert.deepEqual(result.freshness, { source: "mirror", syncedAt: "2026-11-02T08:00:00.000Z" });
  }),
);

it.effect("search flags a mirror whose sync has failed since its last success", () =>
  Effect.gen(function* () {
    const service = makePort({
      mirror: [row()],
      sync: { syncedAtMs: SYNCED_AT_MS, stale: true },
    });
    const result = yield* service.search(binding, {});
    assert.deepEqual(result.freshness, {
      source: "mirror",
      syncedAt: "2026-11-02T08:00:00.000Z",
      stale: true,
    });
  }),
);

it.effect("search says live for a JQL and for a project that has not synced", () =>
  Effect.gen(function* () {
    const byJql = yield* makePort({ mirror: [row()], live: [row()] }).search(binding, {
      jql: "status = Open",
    });
    assert.deepEqual(byJql.freshness, { source: "live" });
    const unsynced = yield* makePort({ mirror: "unsynced", live: [row()] }).search(binding, {});
    assert.deepEqual(unsynced.freshness, { source: "live" });
  }),
);

it.effect("get answers from the tracker's row when the mirror lags behind it", () =>
  Effect.gen(function* () {
    const service = makePort({
      mirror: [row({ updatedAt: "2026-11-02T08:00:00.000+0000", description: "old text" })],
      live: [row({ updatedAt: "2026-11-02T09:00:00.000+0000", description: "new text" })],
    });
    const result = yield* service.get(binding, { issueKey: "IES-1" });
    assert.equal(result.item.description, "new text");
    assert.deepEqual(result.freshness, { source: "live" });
  }),
);

it.effect("get keeps the mirror row when it is current and says when it was synced", () =>
  Effect.gen(function* () {
    const service = makePort({
      mirror: [row({ updatedAt: "2026-11-02T09:00:00.000+0000", description: "mirror text" })],
      live: [row({ updatedAt: "2026-11-02T09:00:00.000+0000", description: "mirror text" })],
    });
    const result = yield* service.get(binding, { issueKey: "IES-1" });
    assert.equal(result.item.description, "mirror text");
    assert.deepEqual(result.freshness, { source: "mirror", syncedAt: "2026-11-02T08:00:00.000Z" });
  }),
);

it.effect("get from an unsynced project is live, with no sync time to report", () =>
  Effect.gen(function* () {
    const service = makePort({ mirror: "unsynced", live: [row()] });
    const result = yield* service.get(binding, { issueKey: "IES-1" });
    assert.deepEqual(result.freshness, { source: "live" });
  }),
);
