import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  attachDigestArrangement,
  clearDigestArrangement,
  digestArrangementKey,
  digestArrangementScope,
  readDigestArrangement,
  storeDigestArrangement,
} from "./t3team-myworkDigestArrangement.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
} from "./t3team-myworkDigestTypes.ts";

const projectInput = (appProjectId: string): T3TeamMyWorkDigestInput => ({
  scope: "project",
  projects: [
    { account: { id: "acct-1", provider: "atlassian" }, externalProjectId: "IES", appProjectId },
  ],
});
const allInput: T3TeamMyWorkDigestInput = { ...projectInput("app-1"), scope: "all" };

const identity = { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES" };

const plan = (heading = "Do now") => ({
  producer: "agent",
  producedAt: "2026-10-06T08:00:00.000Z",
  sections: [
    {
      id: "now",
      kind: "items",
      widget: "my-work.tickets",
      placement: "main",
      heading,
      items: [{ ticketId: "t-1", why: "blocks the release" }],
    },
    {
      id: "reviews",
      kind: "reviews",
      placement: "side",
      heading: "Reviews owed",
      items: [],
      reviewIds: ["pr-1"],
    },
  ],
});

const payload: T3TeamMyWorkDigestPayload = { scope: "project", projects: [], viewer: {} };

const arrangementLayer = it.layer(SqlitePersistenceMemory);

arrangementLayer("t3team digest arrangement store", (it) => {
  it.effect("keys on the viewer account and the scope with the app project spelled out", () =>
    Effect.sync(() => {
      assert.equal(digestArrangementScope(projectInput("app-1")), "project:app-1");
      assert.equal(digestArrangementScope(allInput), "all");
      assert.equal(digestArrangementKey(projectInput("app-1"))?.identity.accountId, "acct-1");
      // No app project: no stable key, so nothing to arrange.
      assert.equal(digestArrangementKey({ scope: "project", projects: [] }), undefined);
      assert.equal(
        digestArrangementScope({
          scope: "project",
          projects: [{ account: { id: "a", provider: "atlassian" }, externalProjectId: "X" }],
        }),
        undefined,
      );
    }),
  );

  it.effect("reads null until stored, then the stored plan; the latest write wins", () =>
    Effect.gen(function* () {
      assert.equal(yield* readDigestArrangement(identity, "project:app-1"), null);

      yield* storeDigestArrangement(identity, "project:app-1", plan("First"));
      yield* storeDigestArrangement(identity, "project:app-1", plan("Second"));
      const stored = yield* readDigestArrangement(identity, "project:app-1");
      assert.equal(stored?.sections[0]?.heading, "Second");
      assert.equal(stored?.producer, "agent");
      assert.deepEqual(stored?.sections[1]?.reviewIds, ["pr-1"]);
    }),
  );

  it.effect("keeps scopes and viewers apart", () =>
    Effect.gen(function* () {
      yield* storeDigestArrangement(identity, "project:app-2", plan());
      assert.equal(yield* readDigestArrangement(identity, "all"), null);
      assert.equal(
        yield* readDigestArrangement({ ...identity, accountId: "acct-2" }, "project:app-2"),
        null,
      );
    }),
  );

  it.effect("clearing returns to the default, and clearing nothing is fine", () =>
    Effect.gen(function* () {
      yield* storeDigestArrangement(identity, "all", plan());
      yield* clearDigestArrangement(identity, "all");
      assert.equal(yield* readDigestArrangement(identity, "all"), null);
      yield* clearDigestArrangement(identity, "all");
    }),
  );

  it.effect(
    "rejects an unknown widget, a placement the widget disallows, and a kind mismatch",
    () =>
      Effect.gen(function* () {
        const section = plan().sections[0]!;
        const reject = (sections: ReadonlyArray<unknown>) =>
          storeDigestArrangement(identity, "all", { ...plan(), sections }).pipe(Effect.exit);

        const unknownWidget = yield* reject([{ ...section, widget: "my-work.nope" }]);
        assert.isTrue(Exit.isFailure(unknownWidget));
        assert.include(String(unknownWidget), "unknown widget 'my-work.nope'");

        const footerReviews = yield* reject([{ ...plan().sections[1]!, placement: "footer" }]);
        assert.include(String(footerReviews), "cannot stand in 'footer' (allowed: side, main)");

        const kindMismatch = yield* reject([{ ...section, widget: "my-work.reviews" }]);
        assert.include(String(kindMismatch), "needs a widget that lists tickets");

        const duplicate = yield* reject([section, section]);
        assert.include(String(duplicate), "Section id 'now' is used twice");

        // A rejected write leaves the stored arrangement untouched.
        assert.equal(yield* readDigestArrangement(identity, "all"), null);
      }),
  );

  it.effect("rejects an unparseable shape and a bad timestamp", () =>
    Effect.gen(function* () {
      assert.isTrue(
        Exit.isFailure(
          yield* storeDigestArrangement(identity, "all", { sections: 3 }).pipe(Effect.exit),
        ),
      );
      const badTime = yield* storeDigestArrangement(identity, "all", {
        ...plan(),
        producedAt: "yesterday",
      }).pipe(Effect.exit);
      assert.include(String(badTime), "not an ISO timestamp");
    }),
  );

  it.effect("stamps the stored plan into the payload, and only when there is one", () =>
    Effect.gen(function* () {
      const input = projectInput("app-9");
      const before = yield* attachDigestArrangement(input, payload);
      assert.equal(before.arrangement, undefined);

      yield* storeDigestArrangement(identity, "project:app-9", plan());
      const after = yield* attachDigestArrangement(input, payload);
      assert.equal(after.arrangement?.sections.length, 2);
      // The payload itself is not mutated.
      assert.equal(payload.arrangement, undefined);
    }),
  );
});
