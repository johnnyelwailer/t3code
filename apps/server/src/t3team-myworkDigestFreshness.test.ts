import { assert, it } from "@effect/vitest";
import type { PullRequestListEntry } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { afterEach } from "vite-plus/test";

import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { prioritizeViewerSprint } from "./t3team-myworkDigestFreshness.ts";
import { loadDigestPrEntries, resetDigestPrCacheForTests } from "./t3team-myworkDigestPrCache.ts";

function ticket(id: string, sprint?: { id: string; name: string; state: string }) {
  return {
    provider: "atlassian",
    kind: "issue",
    id,
    title: id,
    ...(sprint !== undefined
      ? { sprintId: sprint.id, sprintName: sprint.name, sprintState: sprint.state }
      : {}),
  } as unknown as BacklogResourceRef;
}

const platform = { id: "10", name: "Platform Sprint 8.5", state: "active" };
const team = { id: "20", name: "PW Sprint 8.5", state: "active" };

it("puts the sprint most of the viewer's items sit in first", () => {
  const sprints = prioritizeViewerSprint(
    [platform],
    [ticket("A", team), ticket("B", team), ticket("C", platform), ticket("D")],
  );
  assert.deepStrictEqual(
    sprints.map((sprint) => sprint.name),
    ["PW Sprint 8.5", "Platform Sprint 8.5"],
  );
});

it("ignores closed sprints and leaves the list alone without an active one", () => {
  const closed = { id: "30", name: "Old", state: "closed" };
  const sprints = prioritizeViewerSprint([platform], [ticket("A", closed)]);
  assert.deepStrictEqual(sprints, [platform]);
});

const entry = { projectId: "p", repository: "o/r", number: 1, state: "merged" };

function prLayer(list: () => Effect.Effect<{ entries: readonly PullRequestListEntry[] }>) {
  return Layer.succeed(
    PullRequestService,
    PullRequestService.of({ list } as unknown as PullRequestService["Service"]),
  );
}

afterEach(() => resetDigestPrCacheForTests());

it.live("serves a first read that lands within the wait", () =>
  Effect.gen(function* () {
    const result = yield* loadDigestPrEntries("p").pipe(
      Effect.provide(
        prLayer(() => Effect.succeed({ entries: [entry] as unknown as PullRequestListEntry[] })),
      ),
    );
    assert.isFalse(result.pending);
    assert.equal(result.read?.entries.length, 1);
  }),
);

it.live("ships without change requests while a slow first read runs, then serves it", () =>
  Effect.gen(function* () {
    const release = yield* Deferred.make<void>();
    const layer = prLayer(() =>
      Deferred.await(release).pipe(
        Effect.as({ entries: [entry] as unknown as PullRequestListEntry[] }),
      ),
    );
    const first = yield* loadDigestPrEntries("p").pipe(Effect.provide(layer));
    assert.isTrue(first.pending);
    assert.isUndefined(first.read);

    yield* Deferred.succeed(release, undefined);
    yield* Effect.sleep("20 millis");
    const second = yield* loadDigestPrEntries("p").pipe(Effect.provide(layer));
    assert.isFalse(second.pending);
    assert.equal(second.read?.entries.length, 1);
  }),
);

it.effect("keeps saying pending while a stale read refreshes in the background", () =>
  Effect.gen(function* () {
    const release = yield* Deferred.make<void>();
    let calls = 0;
    const layer = prLayer(() => {
      calls += 1;
      const page = { entries: [entry] as unknown as PullRequestListEntry[] };
      return calls === 1 ? Effect.succeed(page) : Deferred.await(release).pipe(Effect.as(page));
    });
    const first = yield* loadDigestPrEntries("p").pipe(Effect.provide(layer));
    assert.isFalse(first.pending);

    yield* TestClock.adjust("31 seconds");
    const stale = yield* loadDigestPrEntries("p").pipe(Effect.provide(layer));
    // The stale read serves at once, and says a newer one is on its way.
    assert.equal(stale.read?.entries.length, 1);
    assert.isTrue(stale.pending);

    yield* Deferred.succeed(release, undefined);
    yield* Effect.yieldNow;
    yield* Effect.yieldNow;
    const settled = yield* loadDigestPrEntries("p").pipe(Effect.provide(layer));
    assert.isFalse(settled.pending);
  }),
);
