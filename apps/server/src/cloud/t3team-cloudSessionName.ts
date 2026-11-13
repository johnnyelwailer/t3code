import { cloudSessionNameSegment } from "@t3tools/shared/t3team-cloudSessionFit";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

/**
 * A session's name rides in its correlation tag: `workflow_dispatch` reveals nothing else of a run
 * than its `run-name`, which echoes the tag as `[<tag>]`. A project-machine session's tag is
 * `<repository name>.s<random>`, a plain one's `s<random>`; the random part keeps every tag unique.
 * The name segment rule is shared with the session selector (`cloudSessionNameSegment`), so a
 * listed name and a repository name compare alike.
 *
 * A correlation tag for one dispatch. Random rather than time-based: two clients dispatching in
 * the same millisecond must not collide, which is the whole failure this exists to prevent.
 */
export const makeSessionTag = (name: string | null) =>
  Effect.map(Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER), (value) => {
    const segment = name === null ? "" : cloudSessionNameSegment(name);
    return `${segment === "" ? "" : `${segment}.`}s${value.toString(36)}`;
  });

// The tag's own shape, wherever it sits: a run name can carry other bracketed parts.
const TAG_RANDOM = String.raw`s[0-9a-z]+`;
const TAG_SEGMENT = String.raw`[A-Za-z0-9_-]+`;
const NAMED_TAG = new RegExp(String.raw`\[(${TAG_SEGMENT})\.${TAG_RANDOM}\]`);
const ANY_TAG = new RegExp(String.raw`\[(?:${TAG_SEGMENT}\.)?${TAG_RANDOM}\]`);

/** The name a run's tag carries, or undefined for a plain session (or a run that predates names). */
export function sessionNameFromRunName(runName: string): string | undefined {
  return NAMED_TAG.exec(runName)?.[1];
}

/**
 * Whether a `session.yml` run was started by this app, from its run name alone. A CI, e2e or
 * flag-verification run labels itself (`[e2e-…]`, `[flag-verify-…]`) and so carries no
 * `s<base36>` part; it runs under the same login, so the picker would otherwise offer it.
 */
export function isAppStartedSessionRun(runName: string): boolean {
  return ANY_TAG.test(runName);
}
