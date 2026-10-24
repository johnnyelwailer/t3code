import {
  DEVCONTAINER_CANDIDATE_PATHS,
  ProjectMachineDiscoveryError,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";
import { repositoryPathFromRemoteUrl } from "@t3tools/source-control-core/server/SourceControlProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { CLONE_ENV } from "../sourceControl/SourceControlRepositoryService.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import {
  MAX_DEFINITION_FILE_BYTES,
  Rejected,
  scanDefinition,
} from "./t3team-machineDefinitionScan.ts";

const decodeProvider = Schema.decodeUnknownOption(SourceControlProviderKind);
const unreadable = () =>
  new ProjectMachineDiscoveryError({
    reason: "unreadable",
    message:
      "The remote machine definition could not be read. Check the repository connection and your git credentials.",
  });

export const scanRemote = Effect.fn("projectMachine.scanRemote")(function* (input: {
  readonly repository: string;
  readonly url: string;
  readonly cwd: string;
  readonly provider?: string | undefined;
}) {
  const providers = yield* PullRequestProviderRegistry;
  const vcs = yield* VcsProcess;
  const detected = detectSourceControlProviderFromRemoteUrl(input.url);
  const kind = Option.getOrUndefined(decodeProvider(input.provider)) ?? detected?.kind;
  const readFileAtRevision =
    kind === undefined ? undefined : providers.get(kind)?.readFileAtRevision;
  const repository = repositoryPathFromRemoteUrl(input.url);
  const host = URL.parse(detected?.baseUrl ?? input.url)?.host;
  if (readFileAtRevision === undefined || repository === null || host === undefined) return null;
  const tip = yield* vcs
    .run({
      operation: "machine.remoteDefaultBranch",
      command: "git",
      args: ["ls-remote", "--symref", "--", input.url, "HEAD"],
      cwd: input.cwd,
      env: CLONE_ENV,
      allowNonZeroExit: true,
      timeoutMs: 15_000,
      maxOutputBytes: 16 * 1024,
    })
    .pipe(Effect.mapError(unreadable));
  const commit = /^([0-9a-f]{40})\s+HEAD\s*$/m.exec(tip.stdout)?.[1];
  if (tip.exitCode !== 0 || tip.stdoutTruncated || commit === undefined) return yield* unreadable();
  const scan = yield* scanDefinition({
    repository: input.repository,
    reader: {
      nestedPaths: Effect.succeed([]),
      read: Effect.fn("projectMachine.readRemoteDefinition")(function* (path: string) {
        const file = yield* readFileAtRevision({
          cwd: input.cwd,
          repository,
          host,
          revision: commit,
          path,
          maxBytes: MAX_DEFINITION_FILE_BYTES,
        }).pipe(
          Effect.mapError(
            () => new Rejected({ reason: `${path} could not be read from the remote repository.` }),
          ),
        );
        if (file === null) return null;
        if (file.size > MAX_DEFINITION_FILE_BYTES)
          return yield* new Rejected({ reason: `${path} is larger than 1 MB.` });
        if (file.content === null)
          return yield* new Rejected({ reason: `${path} could not be read.` });
        return new TextDecoder().decode(file.content);
      }),
    },
  });
  return {
    ...scan,
    remote: { url: input.url, commit },
    notFoundReason: `No remote machine definition was found in ${input.repository} at the default branch. Checked .nexi/machine.json and ${DEVCONTAINER_CANDIDATE_PATHS.join(", ")}. A .devcontainer/<folder>/devcontainer.json needs a local checkout or a .nexi/machine.json pointer.`,
  };
});
