import {
  DEVCONTAINER_CANDIDATE_PATHS,
  LEGACY_PROJECT_MACHINE_FILE_PATH,
  PROJECT_MACHINE_FILE_PATH,
  PROJECT_MACHINE_FILE_PATHS,
  ProjectMachineFile,
  RepositoryRelativePath,
  type ProjectMachineDefinition,
  type ProjectMachineRejectedCandidate,
} from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  devcontainerBuildReferences,
  hashDefinitionFiles,
  resolveBuildReference,
  resolveRepositoryPath,
} from "./t3team-devcontainerSource.ts";
import {
  MAX_DEFINITION_FILE_BYTES,
  Rejected,
  type MachineDefinitionReader,
} from "./t3team-machineDefinitionReader.ts";
export type ScannedMachine = ProjectMachineDefinition & { readonly files: ReadonlyArray<string> };
export interface ProjectMachineScan {
  readonly candidates: ReadonlyArray<ScannedMachine>;
  readonly rejected: ReadonlyArray<ProjectMachineRejectedCandidate>;
}
const decodeMachineFile = Schema.decodeUnknownResult(fromLenientJson(ProjectMachineFile));
const isRepositoryPath = Schema.is(RepositoryRelativePath);

export const scanDefinition = Effect.fn("projectMachine.scanDefinition")(function* (input: {
  readonly repository: string;
  readonly reader: MachineDefinitionReader;
}) {
  const read = Effect.fn("projectMachine.readDefinition")(function* (relative: string) {
    const normalized = resolveRepositoryPath(relative);
    if (normalized === null || !isRepositoryPath(normalized)) {
      return yield* new Rejected({ reason: relative + " points outside the repository." });
    }
    const contents = yield* input.reader.read(normalized);
    if (contents === null) return null;
    if (new TextEncoder().encode(contents).byteLength > MAX_DEFINITION_FILE_BYTES) {
      return yield* new Rejected({ reason: relative + " is larger than 1 MB." });
    }
    return { path: normalized, contents };
  });
  const resolveDevcontainer = Effect.fn("projectMachine.resolveDevcontainer")(function* (
    devcontainerPath: string,
  ) {
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

  // The first location that exists wins, even when it is invalid: a broken `.agents/nexi` file is
  // reported, never silently replaced by a stale legacy one.
  let pointer: { readonly path: string; readonly contents: string } | null = null;
  for (const candidatePath of PROJECT_MACHINE_FILE_PATHS) {
    const pointerRead = yield* read(candidatePath).pipe(Effect.result);
    if (pointerRead._tag === "Failure") {
      if (pointerRead.failure._tag === "RemoteUnavailable") return yield* pointerRead.failure;
      // An unreadable new file is reported, and so is a legacy file that was not used instead.
      const legacyExists =
        candidatePath === PROJECT_MACHINE_FILE_PATH &&
        (yield* read(LEGACY_PROJECT_MACHINE_FILE_PATH).pipe(
          Effect.map((file) => file !== null),
          Effect.orElseSucceed(() => false),
        ));
      return yield* rejectedAt(candidatePath)(
        legacyExists
          ? new Rejected({
              reason: `${pointerRead.failure.reason} ${LEGACY_PROJECT_MACHINE_FILE_PATH} exists and was not used.`,
            })
          : pointerRead.failure,
      );
    }
    pointer = pointerRead.success;
    if (pointer !== null) break;
  }
  if (pointer !== null) {
    const found = pointer;
    // The new location was used. A legacy file next to it is never used, so say so: on a
    // rejection ("a legacy file exists and was not used"), and on a definition when it differs.
    const legacy =
      found.path === PROJECT_MACHINE_FILE_PATH
        ? yield* read(LEGACY_PROJECT_MACHINE_FILE_PATH).pipe(
            Effect.catch((error) =>
              error._tag === "RemoteUnavailable"
                ? Effect.succeed(null)
                : Effect.succeed({ path: LEGACY_PROJECT_MACHINE_FILE_PATH, contents: "" }),
            ),
          )
        : null;
    const notUsed =
      legacy === null ? "" : ` ${LEGACY_PROJECT_MACHINE_FILE_PATH} exists and was not used.`;
    return yield* Effect.gen(function* () {
      const decoded = decodeMachineFile(found.contents);
      if (decoded._tag === "Failure") {
        return yield* new Rejected({ reason: `${found.path} is not a valid machine file.` });
      }
      const machine = decoded.success;
      const files = yield* resolveDevcontainer(machine.devcontainer);
      return {
        candidates: [
          {
            repository: input.repository,
            devcontainerPath: files[0]?.path ?? machine.devcontainer,
            machineFilePath: found.path,
            healthCheck: machine.healthCheck ?? null,
            secrets: machine.secrets ?? [],
            hash: hashDefinitionFiles([found, ...files]),
            files: [found.path, ...files.map((f) => f.path)],
            ...(legacy !== null && legacy.contents !== found.contents
              ? {
                  note: `${found.path} shadows ${LEGACY_PROJECT_MACHINE_FILE_PATH}, which is not used.`,
                }
              : {}),
          },
        ],
        rejected: [],
      } satisfies ProjectMachineScan;
    }).pipe(
      Effect.catchTags({
        Rejected: (error) =>
          rejectedAt(found.path)(new Rejected({ reason: error.reason + notUsed })),
      }),
    );
  }

  const nested = yield* input.reader.nestedPaths;
  const devcontainerPaths = [...DEVCONTAINER_CANDIDATE_PATHS, ...nested.filter(isRepositoryPath)];
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
      Effect.catchTags({ Rejected: rejectedAt(devcontainerPath) }),
    ),
  );
  return {
    candidates: scans.flatMap((scan) => scan.candidates),
    rejected: scans.flatMap((scan) => scan.rejected),
  } satisfies ProjectMachineScan;
});
