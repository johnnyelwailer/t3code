import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  digestLastVisitIdentity,
  readDigestLastVisit,
  recordDigestLastVisit,
} from "./t3team-myworkDigestLastVisit.ts";
import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

const input: T3TeamMyWorkDigestInput = {
  scope: "project",
  projects: [
    {
      account: { id: "acct-1", provider: "atlassian" },
      externalProjectId: "IES",
      appProjectId: "app-1",
    },
  ],
};

const identity = { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES" };
const atMs = 1_789_000_000_000;

const lastVisitLayer = it.layer(SqlitePersistenceMemory);

lastVisitLayer("t3team digest last-visit receipt", (it) => {
  it.effect("derives the viewer identity from the first project entry", () =>
    Effect.gen(function* () {
      const got = digestLastVisitIdentity(input);
      assert.equal(got?.provider, identity.provider);
      assert.equal(got?.accountId, identity.accountId);
      assert.equal(got?.externalProjectId, identity.externalProjectId);
    }),
  );

  it.effect("reads null until a visit is recorded, then the stored value", () =>
    Effect.gen(function* () {
      const before = yield* readDigestLastVisit(identity, "project");
      assert.equal(before, null);

      yield* recordDigestLastVisit(identity, "project", atMs);
      const after = yield* readDigestLastVisit(identity, "project");
      assert.equal(after, atMs);
    }),
  );

  it.effect("upserts: re-recording a visit replaces the timestamp", () =>
    Effect.gen(function* () {
      yield* recordDigestLastVisit(identity, "project", atMs);
      yield* recordDigestLastVisit(identity, "project", atMs + 60_000);
      const read = yield* readDigestLastVisit(identity, "project");
      assert.equal(read, atMs + 60_000);
    }),
  );

  it.effect("scopes are independent", () =>
    Effect.gen(function* () {
      yield* recordDigestLastVisit(identity, "project", atMs);
      const allScope = yield* readDigestLastVisit(identity, "all");
      assert.equal(allScope, null);
    }),
  );

  it.effect("has no identity for an empty project list", () =>
    Effect.sync(() => {
      assert.equal(digestLastVisitIdentity({ scope: "all", projects: [] }), undefined);
    }),
  );
});
