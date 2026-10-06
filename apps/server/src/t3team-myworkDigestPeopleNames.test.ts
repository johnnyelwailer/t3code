import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import {
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
