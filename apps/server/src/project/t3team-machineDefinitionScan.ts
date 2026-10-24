import {
  DEVCONTAINER_CANDIDATE_PATHS,
  PROJECT_MACHINE_FILE_PATH,
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

export const MAX_DEFINITION_FILE_BYTES = 1024 * 1024;
export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  reason: Schema.String,
}) {}
export type ScannedMachine = ProjectMachineDefinition & { readonly files: ReadonlyArray<string> };
export interface ProjectMachineScan {
  readonly candidates: ReadonlyArray<ScannedMachine>;
  readonly rejected: ReadonlyArray<ProjectMachineRejectedCandidate>;
}
export interface MachineDefinitionReader {
  readonly read: (path: string) => Effect.Effect<string | null, Rejected>;
  readonly nestedPaths: Effect.Effect<ReadonlyArray<string>>;
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
    }).pipe(Effect.catchTags({ Rejected: rejectedAt(PROJECT_MACHINE_FILE_PATH) }));
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
