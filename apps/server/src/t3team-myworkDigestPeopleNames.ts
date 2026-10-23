/**
 * Full names for PR people the host only named by login. GitHub's PR reads often carry `login`
 * alone ("kba"), which reads as noise in the digest and cannot be matched to the same person's
 * Jira identity; the host's profile has the real name. One `GET /users/<login>` per person per
 * host, remembered for the server's lifetime (names barely change). The lookups run beside the
 * poll, never inside it: a round shows the names known so far, the next one the rest. At most a
 * dozen are in flight across all projects, and a person two projects share is asked once. A
 * lookup that failed is not asked again straight away: retrying it every round only spends the
 * quota the failure was already short of. "No such user" is settled for an hour; a transient
 * failure (rate limit, network, 5xx) for a few minutes, so the name still turns up once the host
 * recovers.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import type { T3TeamDigestPerson } from "./t3team-myworkDigestTypesPrs.ts";

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const MAX_IN_FLIGHT = 12;
const MAX_REMEMBERED = 500;
export const NOT_FOUND_LOOKUP_TTL_MS = 60 * 60_000;
export const TRANSIENT_LOOKUP_TTL_MS = 5 * 60_000;
const known = new Map<string, string | null>();
/** When a failed lookup may be asked again, by `host:login`. */
const failedUntil = new Map<string, number>();
const inFlight = new Set<string>();
const running: Array<Fiber.Fiber<unknown>> = [];

const decodeProfile = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ name: Schema.NullOr(Schema.String) })),
);

function lookup(api: GitHubApi.GitHubApi["Service"], host: string, login: string) {
  return api.rest({ host, operation: "t3team.digest.profile", path: `users/${login}` }).pipe(
    Effect.map((response) => {
      const profile = decodeProfile(response.body);
      const name = profile._tag === "Some" ? profile.value.name?.trim() : undefined;
      return name ? name : null;
    }),
    // An answer is remembered for good (a name, or "this profile has none"); a failed read is
    // remembered only until its TTL has passed (see the header), and never as "nameless".
    Effect.tap((name) =>
      Effect.sync(() => {
        if (known.size >= MAX_REMEMBERED) known.delete(known.keys().next().value!);
        known.set(`${host}:${login}`, name);
      }),
    ),
    Effect.tapError((error) =>
      Effect.flatMap(Clock.currentTimeMillis, (now) =>
        Effect.sync(() => {
          if (failedUntil.size >= MAX_REMEMBERED)
            failedUntil.delete(failedUntil.keys().next().value!);
          const ttl =
            error._tag === "GitHubApiNotFoundError"
              ? NOT_FOUND_LOOKUP_TTL_MS
              : TRANSIENT_LOOKUP_TTL_MS;
          failedUntil.set(`${host}:${login}`, now + ttl);
        }),
      ),
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
): Effect.Effect<ReadonlyArray<E>, never, GitHubApi.GitHubApi> {
  return Effect.gen(function* () {
    const people = (entry: E) => [
      ...(entry.author ? [entry.author] : []),
      ...(entry.reviewers ?? []),
      ...(entry.engaged ?? []),
    ];
    const now = yield* Clock.currentTimeMillis;
    const missing = new Map<string, { host: string; login: string }>();
    for (const entry of entries)
      for (const person of people(entry))
        if (person.name === person.login && LOGIN.test(person.login)) {
          const key = `${entry.host}:${person.login}`;
          const retryAt = failedUntil.get(key);
          if (retryAt !== undefined && retryAt <= now) failedUntil.delete(key);
          if (
            !known.has(key) &&
            !failedUntil.has(key) &&
            !inFlight.has(key) &&
            inFlight.size + missing.size < MAX_IN_FLIGHT
          )
            missing.set(key, { host: entry.host, login: person.login });
        }
    if (missing.size > 0) {
      const api = yield* GitHubApi.GitHubApi;
      for (const key of missing.keys()) inFlight.add(key);
      const fiber = yield* Effect.all(
        [...missing.values()].map(({ host, login }) => lookup(api, host, login)),
        { concurrency: 4 },
      ).pipe(
        Effect.ensuring(Effect.sync(() => missing.forEach((_, key) => inFlight.delete(key)))),
        Effect.forkDetach,
      );
      running.push(fiber);
      if (running.length > 50) running.splice(0, running.length - 50);
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
  failedUntil.clear();
  inFlight.clear();
  running.length = 0;
}

/** Waits for the lookups a round started (tests only; production never waits on them). */
export const awaitDigestPeopleNamesForTests = Effect.suspend(() =>
  Effect.forEach(running.splice(0), (fiber) => Fiber.await(fiber), { discard: true }),
);
