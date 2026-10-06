/**
 * Reads one checkout for machine definitions (issue #562 in the distribution): a committed
 * `.nexi/machine.json` pointer, else the devcontainer locations the spec defines. Every file it
 * reads must resolve inside the checkout, through symlinks too — a definition's reviewers only
 * ever saw the repository, so a build must not read anything outside it.
 *
 * @module t3team-projectMachineScan
 */
import {
  DEVCONTAINER_CANDIDATE_PATHS,
  PROJECT_MACHINE_FILE_PATH,
  type ProjectMachineDefinition,
  ProjectMachineFile,
  type ProjectMachineRejectedCandidate,
  RepositoryRelativePath,
} from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  devcontainerBuildReferences,
  hashDefinitionFiles,
  resolveBuildReference,
  resolveRepositoryPath,
} from "./t3team-devcontainerSource.ts";

/** Larger than any real devcontainer, Dockerfile or compose file; bounds what a scan reads. */
const MAX_DEFINITION_FILE_BYTES = 1024 * 1024;

const decodeMachineFile = Schema.decodeUnknownResult(fromLenientJson(ProjectMachineFile));
const isRepositoryPath = Schema.is(RepositoryRelativePath);

/** A candidate plus the repository-relative files its definition consists of (never on the wire). */
export type ScannedMachine = ProjectMachineDefinition & { readonly files: ReadonlyArray<string> };

export interface ProjectMachineScan {
  readonly candidates: ReadonlyArray<ScannedMachine>;
  readonly rejected: ReadonlyArray<ProjectMachineRejectedCandidate>;
}

class Rejected extends Schema.TaggedError<Rejected>()("Rejected", { reason: Schema.String }) {}

export const scanCheckout = Effect.fn("projectMachine.scanCheckout")(function* (input: {
  readonly repository: string;
  readonly root: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const realRoot = yield* fileSystem.realPath(input.root).pipe(Effect.orElseSucceed(() => null));
  if (realRoot === null) return { candidates: [], rejected: [] } satisfies ProjectMachineScan;

  /** Reads a repository-relative file; null when absent, `Rejected` when it escapes or is huge. */
  const read = (relative: string) =>
    Effect.gen(function* () {
      const normalized = resolveRepositoryPath(relative);
      if (normalized === null) {
        return yield* new Rejected({ reason: `${relative} points outside the repository.` });
      }
      const absolute = path.join(input.root, normalized);
      if (!(yield* fileSystem.exists(absolute).pipe(Effect.orElseSucceed(() => false)))) {
        return null;
      }
      const real = yield* fileSystem.realPath(absolute).pipe(Effect.orElseSucceed(() => null));
      if (real === null || !(real === realRoot || real.startsWith(realRoot + path.sep))) {
        return yield* new Rejected({ reason: `${relative} links outside the repository.` });
      }
      const info = yield* fileSystem.stat(real).pipe(Effect.orElseSucceed(() => null));
      if (info === null) return null;
      // Something other than a file where a definition belongs is a broken definition, not none.
      if (info.type !== "File") {
        return yield* new Rejected({ reason: `${relative} is not a file.` });
      }
      if (Number(info.size) > MAX_DEFINITION_FILE_BYTES) {
        return yield* new Rejected({ reason: `${relative} is larger than 1 MB.` });
      }
      const contents = yield* fileSystem
        .readFileString(real)
        .pipe(Effect.mapError(() => new Rejected({ reason: `${relative} could not be read.` })));
      return { path: normalized, contents };
    });

  /** Validates one devcontainer and returns every file its build reads, devcontainer first. */
  const resolveDevcontainer = (devcontainerPath: string) =>
    Effect.gen(function* () {
      const file = yield* read(devcontainerPath);
      if (file === null)
        return yield* new Rejected({ reason: `${devcontainerPath} does not exist.` });
      const build = devcontainerBuildReferences(file.contents);
      if ("error" in build) {
        return yield* new Rejected({ reason: `${devcontainerPath} ${build.error}.` });
      }
      const files = [file];
      for (const reference of build.references) {
        const resolved = resolveBuildReference(file.path, reference);
        if (resolved === null) {
          return yield* new Rejected({
            reason: `${devcontainerPath} refers to ${reference}, outside the repository.`,
          });
        }
        const referenced = yield* read(resolved);
        if (referenced === null) {
          return yield* new Rejected({
            reason: `${devcontainerPath} refers to ${reference}, which does not exist.`,
          });
        }
        files.push(referenced);
      }
      return files;
    });

  const rejectedAt = (candidatePath: string) => (error: Rejected) =>
    Effect.succeed({
      candidates: [],
      rejected: [{ repository: input.repository, path: candidatePath, reason: error.reason }],
    } satisfies ProjectMachineScan);

  // A committed pointer is the project's stated intent: it alone decides, devcontainers beside it
  // are not offered as alternatives — not even when the pointer itself cannot be read.
  const pointerRead = yield* read(PROJECT_MACHINE_FILE_PATH).pipe(Effect.result);
  if (pointerRead._tag === "Failure")
    return yield* rejectedAt(PROJECT_MACHINE_FILE_PATH)(pointerRead.failure);
  const pointer = pointerRead.success;
  if (pointer !== null) {
    return yield* Effect.gen(function* () {
      const decoded = decodeMachineFile(pointer.contents);
      if (decoded._tag === "Failure") {
        return yield* new Rejected({
          reason: `${PROJECT_MACHINE_FILE_PATH} is not a valid machine file.`,
        });
      }
      const machine = decoded.success;
      const files = yield* resolveDevcontainer(machine.devcontainer);
      return {
        candidates: [
          {
            repository: input.repository,
            devcontainerPath: files[0]?.path ?? machine.devcontainer,
            machineFilePath: PROJECT_MACHINE_FILE_PATH,
            healthCheck: machine.healthCheck ?? null,
            secrets: machine.secrets ?? [],
            hash: hashDefinitionFiles([pointer, ...files]),
            files: [pointer.path, ...files.map((f) => f.path)],
          },
        ],
        rejected: [],
      } satisfies ProjectMachineScan;
    }).pipe(Effect.catchTag("Rejected", rejectedAt(PROJECT_MACHINE_FILE_PATH)));
  }

  const nested = yield* fileSystem
    .readDirectory(path.join(input.root, ".devcontainer"))
    .pipe(Effect.orElseSucceed(() => [] as Array<string>));
  // A folder name the wire contract cannot carry (a newline, an overlong name) cannot be offered
  // or reported either; such entries are skipped rather than poisoning the whole answer.
  const devcontainerPaths = [
    ...DEVCONTAINER_CANDIDATE_PATHS,
    ...nested
      .toSorted()
      .map((entry) => `.devcontainer/${entry}/devcontainer.json`)
      .filter(isRepositoryPath),
  ];
  const scans = yield* Effect.forEach(devcontainerPaths, (devcontainerPath) =>
    read(devcontainerPath).pipe(
      Effect.flatMap((file) =>
        file === null
          ? Effect.succeed({ candidates: [], rejected: [] } satisfies ProjectMachineScan)
          : resolveDevcontainer(devcontainerPath).pipe(
              Effect.map((files): ProjectMachineScan => ({
                candidates: [
                  {
                    repository: input.repository,
                    devcontainerPath: file.path,
                    machineFilePath: null,
                    healthCheck: null,
                    secrets: [],
                    hash: hashDefinitionFiles(files),
                    files: files.map((f) => f.path),
                  },
                ],
                rejected: [],
              })),
            ),
      ),
      Effect.catchTag("Rejected", rejectedAt(devcontainerPath)),
    ),
  );
  return {
    candidates: scans.flatMap((scan) => scan.candidates),
    rejected: scans.flatMap((scan) => scan.rejected),
  } satisfies ProjectMachineScan;
});
