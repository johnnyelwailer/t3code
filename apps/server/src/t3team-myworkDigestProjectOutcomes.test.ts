import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import { JIRA_SESSION_EXPIRED_CODE, T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { settleDigestProjectLoads } from "./t3team-myworkDigestProjectOutcomes.ts";

const expired = new T3TeamAtlassianError({ code: JIRA_SESSION_EXPIRED_CODE, message: "expired" });
const outage = new T3TeamAtlassianError({ message: "Atlassian request timed out." });

it.effect("keeps the other sites' projects when one site's session is dead", () =>
  Effect.gen(function* () {
    const settled = yield* settleDigestProjectLoads([
      Result.succeed("site-a project"),
      Result.fail(expired),
    ]);
    assert.deepEqual(settled.loaded, ["site-a project"]);
    assert.isTrue(settled.someSessionExpired);
  }),
);

it.effect(
  "fails with the session error when no project loaded, so the client asks to sign in",
  () =>
    Effect.gen(function* () {
      const error = yield* settleDigestProjectLoads([Result.fail(expired)]).pipe(Effect.flip);
      assert.equal(error, expired);
    }),
);

it.effect("fails the round on an outage so the client retries instead of dropping work", () =>
  Effect.gen(function* () {
    const error = yield* settleDigestProjectLoads([
      Result.succeed("site-a project"),
      Result.fail(expired),
      Result.fail(outage),
    ]).pipe(Effect.flip);
    assert.equal(error, outage);
  }),
);
