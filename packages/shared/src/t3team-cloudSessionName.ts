import { cloudSessionNameSegment } from "./t3team-cloudSessionFit.ts";

/**
 * A session's name rides in its correlation tag: `workflow_dispatch` reveals nothing else of a run
 * than its `run-name`, which echoes the tag as `[<tag>]`. A project-machine session's tag is
 * `<repository name>.s<random>`, a plain one's `s<random>`; the random part keeps every tag unique.
 * The name segment rule is shared with the session selector (`cloudSessionNameSegment`), so a
 * listed name and a repository name compare alike.
 *
 * Pure and Effect-free so the phone can mint a tag too. The server's `makeSessionTag` (an Effect
 * over its `Random` service) lives in `apps/server/src/cloud/t3team-cloudSessionName.ts` and draws
 * its integer the same way `makeSessionTagFrom` does.
 */

/** Exclusive upper bound of the random draw: `Random.nextIntBetween(0, MAX_SAFE_INTEGER)` is inclusive. */
const SESSION_TAG_RANGE = Number.MAX_SAFE_INTEGER + 1;

/** The tag for a drawn integer in `[0, Number.MAX_SAFE_INTEGER]`. */
export const sessionTagFromInt = (name: string | null, value: number): string => {
  const segment = name === null ? "" : cloudSessionNameSegment(name);
  return `${segment === "" ? "" : `${segment}.`}s${value.toString(36)}`;
};

/**
 * A correlation tag for one dispatch from any uniform `[0, 1)` source (`Math.random`, or a double
 * built from `crypto.getRandomValues`). Random rather than time-based: two clients dispatching in
 * the same millisecond must not collide, which is the whole failure this exists to prevent.
 */
export const makeSessionTagFrom = (name: string | null, nextDouble: () => number): string =>
  sessionTagFromInt(name, Math.floor(nextDouble() * SESSION_TAG_RANGE));

/** The name a run's tag carries, or undefined for a plain session (or a run that predates names). */
export function sessionNameFromRunName(runName: string): string | undefined {
  // The tag's own shape, wherever it sits: a run name can carry other bracketed parts.
  return /\[([A-Za-z0-9_-]+)\.s[0-9a-z]+\]/.exec(runName)?.[1];
}
