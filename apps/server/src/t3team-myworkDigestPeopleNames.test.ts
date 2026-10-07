import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
import {
  awaitDigestPeopleNamesForTests,
  resetDigestPeopleNamesForTests,
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

it.effect("asks again after a failed lookup instead of remembering it as nameless", () =>
  Effect.gen(function* () {
    resetDigestPeopleNamesForTests();
    let calls = 0;
    let fail = true;
    const api = Layer.mock(GitHubApi.GitHubApi)({
      rest: () => {
        calls += 1;
        return fail
          ? Effect.fail(
              new GitHubApi.GitHubApiRateLimitError({ host: "h", operation: "test" }) as never,
            )
          : restResponse('{"name":"Ada Lovelace"}');
      },
    });
    const entries = [{ host: "h", author: person("ada") }];
    const first = yield* withProfileNames(entries).pipe(Effect.provide(api));
    yield* awaitDigestPeopleNamesForTests;
    assert.strictEqual(first[0]?.author?.name, "ada");
    fail = false;
    yield* withProfileNames(entries).pipe(Effect.provide(api));
    yield* awaitDigestPeopleNamesForTests;
    const second = yield* withProfileNames(entries).pipe(Effect.provide(api));
    assert.strictEqual(second[0]?.author?.name, "Ada Lovelace");
    assert.strictEqual(calls, 2);
  }),
);
