/**
 * ProjectMachineDiscovery - finds the machine definitions a project's checkouts hold, and which
 * one is the project's default template for new cloud sessions (issue #562 in the distribution).
 *
 * Reads the checkouts already on this environment: the project's own repository, then the linked
 * repositories its reference manifest lists, in manifest order. No provider API reads remote files,
 * so a linked repository that was never cloned here contributes nothing.
 *
 * @module t3team-ProjectMachineDiscovery
 */
import {
  type ProjectId,
  type ProjectMachineDiscovery as Discovery,
  ProjectMachineDiscoveryError,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "../t3team-project-repository-utils.ts";
import { repositoryLookupCandidates } from "../t3team-toolBrokerStartChildLinkedRepository.ts";
import { scanCheckout } from "./t3team-projectMachineScan.ts";

export class ProjectMachineDiscovery extends Context.Service<
  ProjectMachineDiscovery,
  {
    readonly discover: (
      projectId: ProjectId,
    ) => Effect.Effect<Discovery, ProjectMachineDiscoveryError>;
  }
>()("t3/project/t3team-ProjectMachineDiscovery/ProjectMachineDiscovery") {}

const decodeManifest = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({ linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)) }),
  ),
);
/** One usable manifest entry. Entries that do not decode are skipped, never trusted by cast. */
const decodeLinkedRepository = Schema.decodeUnknownOption(
  Schema.Struct({
    url: TrimmedNonEmptyString,
    localPath: TrimmedNonEmptyString,
    status: Schema.Literals(["cloned", "updated"]),
  }),
);

/** `owner/repo` for a linked repository's remote URL (the host is dropped, as `start_child` does). */
const repositoryName = (url: string) => {
  const candidates = repositoryLookupCandidates(url);
  return candidates[1] ?? candidates[0] ?? url;
};

/** Pointer-backed definitions first: a committed `.nexi/machine.json` is a stated choice. */
const byIntent = <A extends { readonly machineFilePath: string | null }>(a: A, b: A) =>
  Number(a.machineFilePath === null) - Number(b.machineFilePath === null);

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projections = yield* ProjectionSnapshotQuery;

  const checkouts = Effect.fn("projectMachine.checkouts")(function* (workspaceRoot: string) {
    const own = (yield* fileSystem
      .exists(path.join(workspaceRoot, ".git"))
      .pipe(Effect.orElseSucceed(() => false)))
      ? [{ repository: ".", root: workspaceRoot }]
      : [];
    const manifestText = yield* fileSystem
      .readFileString(
        path.join(workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, MANIFEST_FILE_NAME),
      )
      .pipe(Effect.orElseSucceed(() => null));
    const manifest = manifestText === null ? Option.none() : decodeManifest(manifestText);
    const linked = Option.isNone(manifest)
      ? []
      : (manifest.value.linkedRepositories ?? [])
          .flatMap((raw) => Option.toArray(decodeLinkedRepository(raw)))
          .map((entry) => ({ repository: repositoryName(entry.url), root: entry.localPath }));
    return [...own, ...linked];
  });

  const discover: ProjectMachineDiscovery["Service"]["discover"] = (projectId) =>
    Effect.gen(function* () {
      const project = yield* projections.getProjectShellById(projectId).pipe(
        Effect.mapError(
          () =>
            new ProjectMachineDiscoveryError({
              reason: "unreadable",
              message: "The project could not be read.",
            }),
        ),
      );
      if (Option.isNone(project)) {
        return yield* new ProjectMachineDiscoveryError({
          reason: "unknown_project",
          message: "That project does not exist on this environment.",
        });
      }
      const scans = yield* Effect.forEach(
        yield* checkouts(project.value.workspaceRoot),
        (checkout) => scanCheckout(checkout),
        { concurrency: 4 },
      );
      const candidates = scans.flatMap((scan) => scan.candidates).toSorted(byIntent);
      const first = candidates[0];
      return {
        status: first === undefined ? { _tag: "None" } : { _tag: "Detected", definition: first },
        candidates,
        rejected: scans.flatMap((scan) => scan.rejected),
      } satisfies Discovery;
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );

  return ProjectMachineDiscovery.of({ discover });
});

export const layer = Layer.effect(ProjectMachineDiscovery, make);
