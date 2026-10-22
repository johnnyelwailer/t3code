import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import {
  awaitDigestPeopleNamesForTests,
  NOT_FOUND_LOOKUP_TTL_MS,
  resetDigestPeopleNamesForTests,
  TRANSIENT_LOOKUP_TTL_MS,
  withProfileNames,
} from "./t3team-myworkDigestPeopleNames.ts";

const restResponse = (body: string) =>
  Effect.succeed({
    status: 200,
    headers: {},
    body,
    truncated: false,
    invalidUtf8: false,
  } as never);

/** The API answering `GET /users/<login>` from a profile table; records every call. */
function makeApi(profiles: Record<string, string | null>, calls: string[]) {
  return Layer.mock(GitHubApi.GitHubApi)({
    rest: (input) => {
      const login = input.path.replace("users/", "");
      calls.push(`${input.host}:${login}`);
      return restResponse(JSON.stringify({ name: profiles[login] ?? null }));
    },
  });
}

const person = (login: string, name = login) => ({ login, name });

it.effect("names login-only people from the host profile, once per person", () =>
  Effect.gen(function* () {
    resetDigestPeopleNamesForTests();
    const calls: string[] = [];
    const entries = [
      {
        host: "ghe.example",
        author: person("kba"),
        reviewers: [person("bm"), person("ada", "Ada L")],
      },
      { host: "ghe.example", engaged: [person("kba"), person("ghost")] },
    ];
    const api = makeApi({ kba: "Katharina Bähr", bm: "Benjamin Müller" }, calls);
    // The round itself never waits on the host: it shows what is known, the lookups run beside it.
    const first = yield* withProfileNames(entries).pipe(Effect.provide(api));
    assert.strictEqual(first[0]?.author?.name, "kba");
    yield* awaitDigestPeopleNamesForTests;
    const named = yield* withProfileNames(entries).pipe(Effect.provide(api));
    assert.strictEqual(named[0]?.author?.name, "Katharina Bähr");
    assert.deepStrictEqual(
      named[0]?.reviewers?.map((p) => p.name),
      ["Benjamin Müller", "Ada L"],
    );
    // A profile without a name keeps the login; a person with a name is never looked up.
    assert.deepStrictEqual(
      named[1]?.engaged?.map((p) => p.name),
      ["Katharina Bähr", "ghost"],
    );
    assert.deepStrictEqual(calls.toSorted(), [
      "ghe.example:bm",
      "ghe.example:ghost",
      "ghe.example:kba",
    ]);
    // The next round asks nobody again.
    yield* withProfileNames(entries).pipe(Effect.provide(api));
    assert.strictEqual(calls.length, 3);
  }),
);

/**
 * One person whose lookup fails with `failure` until the host recovers; `state.calls` counts the
 * lookups and `round` runs one digest round to completion.
 */
function failingLookup(failure: () => unknown) {
  const state = { calls: 0, fail: true };
  const api = Layer.mock(GitHubApi.GitHubApi)({
    rest: () => {
      state.calls += 1;
      return state.fail ? Effect.fail(failure() as never) : restResponse('{"name":"Ada Lovelace"}');
    },
  });
  const entries = [{ host: "h", author: person("ada") }];
  const round = Effect.gen(function* () {
    const result = yield* withProfileNames(entries).pipe(Effect.provide(api));
    yield* awaitDigestPeopleNamesForTests;
    return result;
  });
  return { state, round };
}

it.effect("asks again after a transient failure only once the short TTL has passed", () =>
  Effect.gen(function* () {
    resetDigestPeopleNamesForTests();
    const { state, round } = failingLookup(
      () => new GitHubApi.GitHubApiRateLimitError({ host: "h", operation: "test" }),
    );
    const first = yield* round;
    assert.strictEqual(first[0]?.author?.name, "ada");
    assert.strictEqual(state.calls, 1);
    // The host recovers, but the failure is remembered: later rounds inside the TTL stay quiet
    // and the person is not mistaken for nameless.
    state.fail = false;
    yield* round;
    yield* TestClock.adjust(TRANSIENT_LOOKUP_TTL_MS - 1);
    yield* round;
    assert.strictEqual(state.calls, 1);
    yield* TestClock.adjust(1);
    yield* round;
    const named = yield* round;
    assert.strictEqual(named[0]?.author?.name, "Ada Lovelace");
    assert.strictEqual(state.calls, 2);
  }),
);

it.effect("keeps a not-found lookup quiet for the long TTL", () =>
  Effect.gen(function* () {
    resetDigestPeopleNamesForTests();
    const { state, round } = failingLookup(
      () => new GitHubApi.GitHubApiNotFoundError({ host: "h", operation: "test" }),
    );
    yield* round;
    assert.strictEqual(state.calls, 1);
    state.fail = false;
    // Well past the transient TTL, still not asked: the profile was not there.
    yield* TestClock.adjust(NOT_FOUND_LOOKUP_TTL_MS - 1);
    yield* round;
    assert.strictEqual(state.calls, 1);
    yield* TestClock.adjust(1);
    yield* round;
    const named = yield* round;
    assert.strictEqual(named[0]?.author?.name, "Ada Lovelace");
    assert.strictEqual(state.calls, 2);
  }),
);
