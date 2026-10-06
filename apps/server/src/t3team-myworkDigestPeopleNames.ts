/**
 * Full names for PR people the host only named by login. GitHub's PR reads often carry `login`
 * alone ("kba"), which reads as noise in the digest and cannot be matched to the same person's
 * Jira identity; the host's profile has the real name. One `gh api users/<login>` per person per
 * host, remembered for the server's lifetime (names barely change), a bounded handful per round.
 */

import { homedir } from "node:os";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import type { T3TeamDigestPerson } from "./t3team-myworkDigestTypesPrs.ts";

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const LOOKUPS_PER_ROUND = 12;
const MAX_REMEMBERED = 500;
const known = new Map<string, string | null>();

const decodeProfile = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ name: Schema.NullOr(Schema.String) })),
);

function lookup(gh: GitHubCli.GitHubCli["Service"], host: string, login: string) {
  return gh
    .execute({
      cwd: homedir(),
      args: ["api", `users/${login}`],
      env: { GH_HOST: host },
      rateLimitHost: host,
    })
    .pipe(
      Effect.map((output) => {
        const profile = decodeProfile(output.stdout);
        const name = profile._tag === "Some" ? profile.value.name?.trim() : undefined;
        return name ? name : null;
      }),
      // Only an answer is remembered (a name, or "this profile has none"); a failed read is
      // asked again next round.
      Effect.tap((name) =>
        Effect.sync(() => {
          if (known.size >= MAX_REMEMBERED) known.delete(known.keys().next().value!);
          known.set(`${host}:${login}`, name);
        }),
      ),
      Effect.orElseSucceed(() => null),
    );
}

type Entry = {
  readonly host: string;
  readonly author?: T3TeamDigestPerson;
  readonly reviewers?: ReadonlyArray<T3TeamDigestPerson>;
  readonly engaged?: ReadonlyArray<T3TeamDigestPerson>;
};

/** The entries with every login-only person given the host's full name, where it has one. */
export function withProfileNames<E extends Entry>(
  entries: ReadonlyArray<E>,
): Effect.Effect<ReadonlyArray<E>, never, GitHubCli.GitHubCli> {
  return Effect.gen(function* () {
    const people = (entry: E) => [
      ...(entry.author ? [entry.author] : []),
      ...(entry.reviewers ?? []),
      ...(entry.engaged ?? []),
    ];
    const missing = new Map<string, { host: string; login: string }>();
    for (const entry of entries)
      for (const person of people(entry))
        if (person.name === person.login && LOGIN.test(person.login)) {
          const key = `${entry.host}:${person.login}`;
          if (!known.has(key)) missing.set(key, { host: entry.host, login: person.login });
        }
    if (missing.size > 0) {
      const gh = yield* GitHubCli.GitHubCli;
      yield* Effect.all(
        [...missing.values()]
          .slice(0, LOOKUPS_PER_ROUND)
          .map(({ host, login }) => lookup(gh, host, login)),
        { concurrency: 4 },
      );
    }
    const named = (host: string) => (person: T3TeamDigestPerson) => {
      const name = person.name === person.login ? known.get(`${host}:${person.login}`) : null;
      return name ? { ...person, name } : person;
    };
    return entries.map((entry) => {
      const name = named(entry.host);
      return {
        ...entry,
        ...(entry.author ? { author: name(entry.author) } : {}),
        ...(entry.reviewers ? { reviewers: entry.reviewers.map(name) } : {}),
        ...(entry.engaged ? { engaged: entry.engaged.map(name) } : {}),
      };
    });
  });
}

export function resetDigestPeopleNamesForTests(): void {
  known.clear();
}
