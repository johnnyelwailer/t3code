import { SourceControlProviderKind } from "@t3tools/contracts";
import { repositoryPathFromRemoteUrl } from "@t3tools/source-control-core/server/SourceControlProvider";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";
import {
  MAX_DEFINITION_FILE_BYTES,
  Rejected,
  RemoteUnavailable,
} from "./t3team-machineDefinitionReader.ts";
import { scanDefinition } from "./t3team-machineDefinitionScan.ts";
import { remoteHead } from "./t3team-remoteMachineHead.ts";

export interface RemoteMachineInput {
  readonly repository: string;
  readonly url: string;
  readonly cwd: string;
  readonly provider?: string | undefined;
}
const decodeProvider = Schema.decodeUnknownOption(SourceControlProviderKind);

export const remoteTarget = Effect.fn("projectMachine.remoteTarget")(function* (
  input: RemoteMachineInput,
) {
  const providers = yield* PullRequestProviderRegistry;
  const detected = sourceControlDefinitions.recognizeRemote(input.url);
  const kind = Option.getOrUndefined(decodeProvider(input.provider)) ?? detected?.kind;
  const read = kind === undefined ? undefined : providers.get(kind)?.readFileAtRevision;
  const repository = repositoryPathFromRemoteUrl(input.url);
  const host = URL.parse(detected?.baseUrl ?? input.url)?.host;
  if (kind === undefined || read === undefined || repository === null || host === undefined) {
    return yield* new RemoteUnavailable({
      reason: `Remote discovery isn't available for ${kind ?? "this provider"}; check the repository out locally.`,
    });
  }
  return { url: input.url, cwd: input.cwd, kind, read, repository, host };
});
export type RemoteMachineTarget = Effect.Success<ReturnType<typeof remoteTarget>>;

export const scanRemoteAtCommit = Effect.fn("projectMachine.scanRemoteAtCommit")(function* (
  target: RemoteMachineTarget,
  commit: string,
) {
  const limits = yield* SourceControlRateLimit.SourceControlRateLimit;
  const key = { provider: target.kind, host: target.host };
  return yield* scanDefinition({
    repository: target.repository,
    reader: {
      nestedPaths: Effect.succeed([]),
      read: Effect.fn("projectMachine.readRemoteDefinition")(function* (path: string) {
        const lease = yield* limits.check(key).pipe(
          Effect.mapError(
            (cause) =>
              new RemoteUnavailable({
                reason: "Remote discovery is paused by the provider's rate limit.",
                cause,
              }),
          ),
        );
        const file = yield* target
          .read({
            cwd: target.cwd,
            repository: target.repository,
            host: target.host,
            revision: commit,
            path,
            maxBytes: MAX_DEFINITION_FILE_BYTES,
          })
          .pipe(
            Effect.tap(() => limits.recordSuccess({ ...key, lease })),
            Effect.tapError((error) =>
              error.reason === "rate-limited"
                ? limits.recordRateLimit({ ...key, lease, retryAt: error.retryAt })
                : Effect.void,
            ),
            Effect.mapError(
              (cause) =>
                new RemoteUnavailable({
                  reason:
                    cause.reason === "rate-limited"
                      ? "Remote discovery is paused by the provider's rate limit."
                      : "Remote discovery is temporarily unavailable.",
                  cause,
                }),
            ),
          );
        if (file === null) return null;
        if (file.size > MAX_DEFINITION_FILE_BYTES)
          return yield* new Rejected({ reason: `${path} is larger than 1 MB.` });
        if (file.content === null)
          return yield* new RemoteUnavailable({
            reason: "The remote file contents could not be read.",
          });
        return new TextDecoder().decode(file.content);
      }),
    },
  });
});

export const scanRemote = Effect.fn("projectMachine.scanRemote")(function* (
  input: RemoteMachineInput,
) {
  const target = yield* remoteTarget(input);
  const commit = yield* remoteHead(target);
  if (commit === null) return null;
  const scan = yield* scanRemoteAtCommit(target, commit);
  return {
    candidates: scan.candidates.map((machine) => ({ ...machine, repository: input.repository })),
    rejected: scan.rejected.map((candidate) => ({ ...candidate, repository: input.repository })),
    remote: { url: input.url, commit },
  };
});
