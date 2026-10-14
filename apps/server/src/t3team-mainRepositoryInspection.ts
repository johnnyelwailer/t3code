/**
 * The once-per-project remote inspection for a main repository among linked repositories that are
 * not cloned (`detectMainRepositoryCandidatesWithRemote`). Its marker lives in the reference
 * manifest and is written only when an inspection read every remote: a later creation bootstrap
 * then does no git work, while one after a failed inspection (network, credentials, timeout)
 * tries again. Concurrent creations are kept to one inspection by an in-process claim. Every
 * manifest rewrite carries the marker forward.
 *
 * @module t3team-mainRepositoryInspection
 */
import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { inspectRemoteProjectStateOnDefaultBranch } from "./t3team-linkedRemoteProjectStateInspect.ts";
import { LINKED_REPOSITORY_SYNC_CONCURRENCY } from "./t3team-linkedRepositorySyncConcurrency.ts";
import { detectMainRepositoryCandidates } from "./t3team-projectMainRepositoryState.ts";
import {
  formatReferenceManifestJson,
  type LinkedRepositoryBootstrapResult,
  MANIFEST_FILE_NAME,
  type ReferenceManifestFile,
} from "./t3team-project-repository-utils.ts";

export type MainRepositoryInspection = {
  readonly inspectedAt: string;
  /** Candidates the inspection found; empty while it runs and when it found none. */
  readonly candidates: ReadonlyArray<ProjectMainRepositoryCandidate>;
};

const MainRepositoryInspectionJson = Schema.Struct({
  mainRepositoryInspection: Schema.optional(
    Schema.Struct({
      inspectedAt: Schema.String,
      candidates: Schema.Array(Schema.Struct({ url: Schema.String, checkoutPath: Schema.String })),
    }),
  ),
});
const decodeInspection = Schema.decodeUnknownOption(
  Schema.fromJsonString(MainRepositoryInspectionJson),
);

const decodeManifestObject = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

/** The recorded inspection in a reference manifest's JSON, if any (malformed reads as none). */
export const mainRepositoryInspectionFromManifestJson = (
  raw: string,
): MainRepositoryInspection | undefined =>
  Option.getOrUndefined(decodeInspection(raw))?.mainRepositoryInspection;

/** Records the inspection's candidates, keeping everything else in the manifest as written. */
export const recordMainRepositoryInspectionCandidates = Effect.fn(
  "recordMainRepositoryInspectionCandidates",
)(function* (
  referencesRoot: string,
  inspectedAt: string,
  candidates: ReadonlyArray<ProjectMainRepositoryCandidate>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(referencesRoot, MANIFEST_FILE_NAME);
  const raw = yield* fileSystem.readFileString(manifestPath).pipe(Effect.orElseSucceed(() => ""));
  const manifest = Option.getOrUndefined(decodeManifestObject(raw));
  if (!manifest) return;
  yield* writeFileStringAtomically({
    filePath: manifestPath,
    contents: formatReferenceManifestJson({
      ...manifest,
      mainRepositoryInspection: { inspectedAt, candidates },
    } as unknown as ReferenceManifestFile),
  });
});

/** Like {@link detectMainRepositoryCandidates}, plus repositories whose **committed** remote
 * default branch already carries a project state dir (see `t3team-linkedRemoteProjectStateInspect`).
 * Pending clones with no local tree yet can still appear when the remote inspect succeeds. */
export const detectMainRepositoryCandidatesWithRemote = Effect.fn(
  "detectMainRepositoryCandidatesWithRemote",
)(function* (linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>) {
  const local = yield* detectMainRepositoryCandidates(linkedRepositories);
  const seen = new Set(local.map((candidate) => candidate.checkoutPath));
  // Bounded like the sync service's clones: a project may link dozens of repositories.
  const pending = linkedRepositories.filter((entry) => {
    const checkoutPath = entry.localPath?.trim();
    return checkoutPath && !seen.has(checkoutPath);
  });
  const inspected = yield* Effect.forEach(
    pending,
    (entry) =>
      inspectRemoteProjectStateOnDefaultBranch(entry.url).pipe(
        Effect.map((remote) => ({
          completed: true,
          candidates: remote.hasProjectStateDir
            ? [{ url: entry.url, checkoutPath: entry.localPath.trim() }]
            : [],
        })),
        // Unreadable (network, credentials, timeout): not "no state dir". Say which repository,
        // and report the inspection incomplete so it is not recorded as done.
        Effect.catchCause((cause) =>
          Effect.logWarning("Could not inspect a linked repository for a main repository.", {
            repository: entry.url,
            cause,
          }).pipe(Effect.as({ completed: false, candidates: [] })),
        ),
      ),
    { concurrency: LINKED_REPOSITORY_SYNC_CONCURRENCY },
  );
  const remoteCandidates: ProjectMainRepositoryCandidate[] = [];
  for (const candidate of inspected.flatMap((result) => result.candidates)) {
    if (seen.has(candidate.checkoutPath)) continue;
    seen.add(candidate.checkoutPath);
    remoteCandidates.push(candidate);
  }
  return {
    candidates: [...local, ...remoteCandidates],
    /** Every remote was read; only then may the inspection be recorded as done. */
    complete: inspected.every((result) => result.completed),
  };
});

const inspectionsInFlight = new Set<string>();

/** Runs `inspect` unless an inspection for `referencesRoot` already runs in this process (then
 * `None`). The claim is released however `inspect` ends. */
export const withMainRepositoryInspectionClaim = <A, E, R>(
  referencesRoot: string,
  inspect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      if (inspectionsInFlight.has(referencesRoot)) return false;
      inspectionsInFlight.add(referencesRoot);
      return true;
    }),
    (claimed) => (claimed ? Effect.map(inspect, Option.some) : Effect.succeed(Option.none())),
    (claimed) =>
      claimed ? Effect.sync(() => void inspectionsInFlight.delete(referencesRoot)) : Effect.void,
  );

/** `local` plus the `recorded` candidates not already among them (by checkout path). */
export const mergeMainRepositoryCandidates = (
  local: ReadonlyArray<ProjectMainRepositoryCandidate>,
  recorded: ReadonlyArray<ProjectMainRepositoryCandidate>,
): ReadonlyArray<ProjectMainRepositoryCandidate> => [
  ...local,
  ...recorded.filter((candidate) =>
    local.every((known) => known.checkoutPath !== candidate.checkoutPath),
  ),
];
