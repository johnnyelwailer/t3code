import { type Project, TrimmedNonEmptyString } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "../t3team-project-repository-utils.ts";
import { repositoryLookupCandidates } from "../t3team-toolBrokerStartChildLinkedRepository.ts";

const decodeManifest = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
      mainRepository: Schema.optional(Schema.Struct({ url: Schema.optional(Schema.String) })),
    }),
  ),
);
const decodeLinked = Schema.decodeUnknownOption(
  Schema.Struct({
    url: TrimmedNonEmptyString,
    localPath: TrimmedNonEmptyString,
    status: Schema.Literals(["cloned", "updated", "not-cloned", "pending", "failed"]),
  }),
);

export interface MachineRepositoryLocation {
  readonly repository: string;
  readonly root: string;
  readonly local: boolean;
  readonly url?: string | undefined;
  readonly provider?: string | undefined;
}

export const machineRepositories = Effect.fn("projectMachine.repositories")(function* (
  project: Project,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));
  const text = yield* fs
    .readFileString(
      path.join(project.workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, MANIFEST_FILE_NAME),
    )
    .pipe(Effect.orElseSucceed(() => ""));
  const manifest = Option.getOrUndefined(decodeManifest(text));
  const ownLocal = yield* exists(path.join(project.workspaceRoot, ".git"));
  const ownUrl = project.repositoryIdentity?.locator.remoteUrl ?? manifest?.mainRepository?.url;
  const own: Array<MachineRepositoryLocation> =
    ownLocal || ownUrl !== undefined
      ? [
          {
            repository: ".",
            root: project.workspaceRoot,
            local: ownLocal,
            url: ownUrl,
            provider: project.repositoryIdentity?.provider,
          },
        ]
      : [];
  const linked: ReadonlyArray<MachineRepositoryLocation> = yield* Effect.forEach(
    (manifest?.linkedRepositories ?? []).flatMap((raw) => Option.toArray(decodeLinked(raw))),
    (entry) =>
      Effect.gen(function* () {
        const candidates = repositoryLookupCandidates(entry.url);
        const local = yield* exists(path.join(entry.localPath, ".git"));
        return {
          repository: candidates[1] ?? candidates[0] ?? entry.url,
          root: entry.localPath,
          local,
          url: entry.url,
        } satisfies MachineRepositoryLocation;
      }),
  );
  return [...own, ...linked];
});
