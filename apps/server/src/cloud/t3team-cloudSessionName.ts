import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

/**
 * A session's name rides in its correlation tag: `workflow_dispatch` reveals nothing else of a run
 * than its `run-name`, which echoes the tag as `[<tag>]`. A project-machine session's tag is
 * `<repository name>.s<random>`, a plain one's `s<random>`; the random part keeps every tag unique.
 */
const NAME_LIMIT = 40;
const nameSegment = (value: string) =>
  value
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, NAME_LIMIT)
    .replace(/^-+|-+$/g, "");

/**
 * A correlation tag for one dispatch. Random rather than time-based: two clients dispatching in
 * the same millisecond must not collide, which is the whole failure this exists to prevent.
 */
export const makeSessionTag = (name: string | null) =>
  Effect.map(Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER), (value) => {
    const segment = name === null ? "" : nameSegment(name);
    return `${segment === "" ? "" : `${segment}.`}s${value.toString(36)}`;
  });

/** The name a run's tag carries, or undefined for a plain session (or a run that predates names). */
export function sessionNameFromRunName(runName: string): string | undefined {
  const tag = /\[([^\]]+)\]/.exec(runName)?.[1];
  const dot = tag?.lastIndexOf(".") ?? -1;
  return tag !== undefined && dot > 0 ? tag.slice(0, dot) : undefined;
}
