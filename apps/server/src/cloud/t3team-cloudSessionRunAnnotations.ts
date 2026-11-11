/**
 * What a session run wrote to its job log as annotations, read back by the delete: hive's
 * stage-snapshot.sh notice naming the projects whose only copy is the snapshot, and
 * machine-preserve.sh's warnings that the checkout was not saved (the step itself still succeeds).
 * A job is a check run, so its annotations sit under its job id.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { DeleteFlow } from "./t3team-CloudSessionDeleteFlow.ts";
import { jobStepsRequest, repoApiPath } from "./t3team-githubActionsSessionClient.ts";

const SNAPSHOT_ONLY_PROJECTS = "nexi-snapshot-only-projects";

/** machine-preserve.sh's messages when the checkout was not preserved; hive pins them. */
const PRESERVE_FAILURES = [
  "Machine startup did not complete; preservation skipped.",
  "Could not commit the session's checkout; it is lost with this VM.",
  "Could not push the session's checkout; it is lost with this VM.",
];

export interface RunAnnotation {
  readonly level: string;
  readonly title: string;
  readonly message: string;
}

const parse = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function parseJobIds(body: string): ReadonlyArray<number> | null {
  const parsed = parse(body);
  if (!isRecord(parsed) || !Array.isArray(parsed["jobs"])) return null;
  return parsed["jobs"].flatMap((job) =>
    isRecord(job) && typeof job["id"] === "number" ? [job["id"]] : [],
  );
}

export function parseAnnotations(body: string): ReadonlyArray<RunAnnotation> | null {
  const parsed = parse(body);
  if (!Array.isArray(parsed)) return null;
  return parsed.filter(isRecord).map((entry) => ({
    level: text(entry["annotation_level"]),
    title: text(entry["title"]),
    message: text(entry["message"]),
  }));
}

/** Every project a stage named as snapshot-only; null when none said, or one is unreadable. */
export function snapshotOnlyProjectsOf(
  annotations: ReadonlyArray<RunAnnotation>,
): ReadonlyArray<string> | null {
  const notices = annotations.filter((entry) => entry.title === SNAPSHOT_ONLY_PROJECTS);
  if (notices.length === 0) return null;
  const names = new Set<string>();
  for (const notice of notices) {
    const listed = parse(notice.message);
    if (!Array.isArray(listed) || !listed.every((name) => typeof name === "string")) return null;
    for (const name of listed) names.add(name);
  }
  return [...names];
}

export function preserveFailureOf(annotations: ReadonlyArray<RunAnnotation>): string | null {
  return annotations.find((entry) => PRESERVE_FAILURES.includes(entry.message))?.message ?? null;
}

const unreadable = () =>
  new CloudSessionFailedError({
    reason: "unreachable",
    message: "The provider returned an unreadable job log; the delete was not done.",
  });

const readRunAnnotations = Effect.fn("cloud.session.delete.annotations")(function* (
  flow: DeleteFlow,
  runId: number,
) {
  const jobs = parseJobIds(
    (yield* flow.gh.runInteractive(jobStepsRequest(flow.repoRef, runId))).body,
  );
  if (jobs === null) return yield* unreadable();
  const annotations: RunAnnotation[] = [];
  for (const job of jobs) {
    const result = yield* flow.gh.runInteractive({
      kind: "rest",
      operation: "cloudSession.annotations",
      path: repoApiPath(flow.repoRef, `check-runs/${job}/annotations?per_page=100`),
    });
    const parsed = parseAnnotations(result.body);
    if (parsed === null || result.truncated) return yield* unreadable();
    annotations.push(...parsed);
  }
  return annotations;
});

const blocked = (message: string) =>
  new CloudSessionFailedError({ reason: "delete_blocked", message });

/**
 * After the stop: refuse when the machine reported its checkout was not saved, or when the
 * snapshot holds a project with no other copy that the user did not confirm losing.
 */
export const assertNothingUnsaid = Effect.fn("cloud.session.delete.unsaid")(function* (
  flow: DeleteFlow,
  runId: number,
  hasCheckout: boolean,
  acknowledged: ReadonlyArray<string>,
) {
  const annotations = yield* readRunAnnotations(flow, runId);
  const failure = hasCheckout ? preserveFailureOf(annotations) : null;
  if (failure !== null) {
    return yield* blocked(
      `The machine reported "${failure}" when it stopped, so deleting would lose work. Nothing was deleted.`,
    );
  }
  const unconfirmed = (snapshotOnlyProjectsOf(annotations) ?? []).filter(
    (name) => !acknowledged.includes(name),
  );
  if (unconfirmed.length > 0) {
    return yield* blocked(
      `These projects have no git remote and exist only in this session's snapshot: ${unconfirmed.join(", ")}. Delete again to confirm losing them.`,
    );
  }
});

/** The snapshot-only projects the first run that names any reports, in order; null when none do. */
export const snapshotOnlyProjectsFor = Effect.fn("cloud.session.delete.onlyHere")(function* (
  flow: DeleteFlow,
  runIds: ReadonlyArray<number>,
) {
  for (const runId of runIds) {
    const named = snapshotOnlyProjectsOf(yield* readRunAnnotations(flow, runId));
    if (named !== null) return named;
  }
  return null;
});
