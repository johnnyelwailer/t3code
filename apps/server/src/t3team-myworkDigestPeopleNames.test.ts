import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import {
  awaitDigestPeopleNamesForTests,
  resetDigestPeopleNamesForTests,
  withProfileNames,
} from "./t3team-myworkDigestPeopleNames.ts";

/** gh answering `api users/<login>` from a profile table; records every call. */
function makeGh(profiles: Record<string, string | null>, calls: string[]) {
  return Layer.mock(GitHubCli.GitHubCli)({
    execute: (input) => {
      const login = String(input.args[1]).replace("users/", "");
      calls.push(`${String(input.env?.GH_HOST)}:${login}`);
      return Effect.succeed({
        stdout: JSON.stringify({ name: profiles[login] ?? null }),
        stderr: "",
        exitCode: 0,
      } as never);
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
    const gh = makeGh({ kba: "Katharina Bähr", bm: "Benjamin Müller" }, calls);
    // The round itself never waits on the host: it shows what is known, the lookups run beside it.
    const first = yield* withProfileNames(entries).pipe(Effect.provide(gh));
    assert.strictEqual(first[0]?.author?.name, "kba");
    yield* awaitDigestPeopleNamesForTests;
    const named = yield* withProfileNames(entries).pipe(Effect.provide(gh));
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
    yield* withProfileNames(entries).pipe(Effect.provide(gh));
    assert.strictEqual(calls.length, 3);
  }),
);

it.effect("asks again after a failed lookup instead of remembering it as nameless", () =>
  Effect.gen(function* () {
    resetDigestPeopleNamesForTests();
    let calls = 0;
    let fail = true;
    const gh = Layer.mock(GitHubCli.GitHubCli)({
      execute: () => {
        calls += 1;
        return fail
          ? Effect.fail(new Error("rate limited") as never)
          : Effect.succeed({ stdout: '{"name":"Ada Lovelace"}', stderr: "", exitCode: 0 } as never);
      },
    });
    const entries = [{ host: "h", author: person("ada") }];
    const first = yield* withProfileNames(entries).pipe(Effect.provide(gh));
    yield* awaitDigestPeopleNamesForTests;
    assert.strictEqual(first[0]?.author?.name, "ada");
    fail = false;
    yield* withProfileNames(entries).pipe(Effect.provide(gh));
    yield* awaitDigestPeopleNamesForTests;
    const second = yield* withProfileNames(entries).pipe(Effect.provide(gh));
    assert.strictEqual(second[0]?.author?.name, "Ada Lovelace");
    assert.strictEqual(calls, 2);
  }),
);
