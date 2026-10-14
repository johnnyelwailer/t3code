/**
 * The once-per-project remote inspection for a main repository among linked repositories that are
 * not cloned (`detectMainRepositoryCandidatesWithRemote`). Its marker lives in the reference
 * manifest: written, under the manifest lock, BEFORE the inspection runs, so a second creation
 * bootstrap — even a concurrent one — finds it and does no git work; the candidates found are
 * patched in afterwards. Every bootstrap carries the marker forward.
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

import {
  formatReferenceManifestJson,
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
