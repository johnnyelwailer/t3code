import { Project, ProjectId, SourceControlProviderKind, type VcsError } from "@t3tools/contracts";
import type {
  PullRequestProviderApi,
  PullRequestProviderError,
} from "@t3tools/source-control-core/server/PullRequestProvider";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as Context from "effect/Context";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/process";

import { ProjectService } from "./ProjectService.ts";
import * as Discovery from "./t3team-ProjectMachineDiscovery.ts";
import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { VcsProcess, type VcsProcessInput } from "../vcs/VcsProcess.ts";
import {
  HIDDEN_T3TEAM_DIR,
  REFERENCES_DIR_NAME,
  MANIFEST_FILE_NAME,
} from "../t3team-project-repository-utils.ts";

class TestProvider extends Context.Service<TestProvider, PullRequestProviderApi>()(
  "t3/project/t3team-remoteMachine.fixtures/TestProvider",
) {}

const decodeProject = Schema.decodeUnknownEffect(Project);

export const remoteCommit = "a".repeat(40);
export const remoteProjectId = ProjectId.make("remote-machine");

export const remoteFixture = Effect.fn("remoteFixture")(function* (input: {
  readonly files?: Record<string, string>;
  readonly localFiles?: Record<string, string>;
  readonly url?: string;
  readonly ownRemote?: boolean;
  readonly enabled?: boolean;
  readonly unsupported?: boolean;
  readonly gitOutput?: string | (() => string);
  readonly gitExitCode?: number;
  readonly gitTruncated?: boolean;
  readonly gitError?: VcsError;
  readonly readError?: PullRequestProviderError;
  readonly beforeRead?: Effect.Effect<void>;
  readonly manifest?: (root: string) => string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-remote-machine-" });
  for (const [file, content] of Object.entries(input.localFiles ?? {})) {
    const absolute = path.join(root, file);
    yield* fs.makeDirectory(path.dirname(absolute), { recursive: true });
    yield* fs.writeFileString(absolute, content);
  }
  if (input.manifest !== undefined) {
    const directory = path.join(root, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* fs.writeFileString(path.join(directory, MANIFEST_FILE_NAME), input.manifest(root));
  }
  const project = yield* decodeProject({
    id: remoteProjectId,
    title: "Remote machine",
    workspaceRoot: root,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-24T00:00:00Z",
    updatedAt: "2026-10-24T00:00:00Z",
    deletedAt: null,
    repositoryIdentity:
      input.ownRemote === false
        ? null
        : {
            canonicalKey: "nexplore.ghe.com/acme/api",
            locator: {
              source: "git-remote",
              remoteName: "origin",
              remoteUrl: input.url ?? "https://nexplore.ghe.com/acme/api.git",
            },
          },
  });
  const reads: Array<{ path: string; revision: string; repository: string; host: string }> = [];
  const commands: Array<VcsProcessInput> = [];
  const read: NonNullable<PullRequestProviderApi["readFileAtRevision"]> = (request) => {
    reads.push(request);
    if (input.readError !== undefined) return Effect.fail(input.readError);
    const content = input.files?.[request.path];
    return Effect.andThen(
      input.beforeRead ?? Effect.void,
      Effect.succeed(
        content === undefined
          ? null
          : {
              blobSha: "blob",
              size: new TextEncoder().encode(content).byteLength,
              content: new TextEncoder().encode(content),
            },
      ),
    );
  };
  const kind = SourceControlProviderKind.make(
    detectSourceControlProviderFromRemoteUrl(input.url ?? "https://nexplore.ghe.com/acme/api.git")
      ?.kind ?? "github",
  );
  const mocked = yield* TestProvider.pipe(
    Effect.provide(
      Layer.mock(TestProvider)({
        kind,
        capabilities: {
          diff: false,
          comment: false,
          actions: [],
          mergeMethods: [],
          search: false,
          review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
          reviewers: { request: false, listCandidates: false },
        },
      }),
    ),
  );
  const { readFileAtRevision: _unused, ...unsupported } = mocked;
  const provider: PullRequestProviderApi = input.unsupported
    ? unsupported
    : { ...mocked, readFileAtRevision: read };
  const dependencies = Layer.mergeAll(
    SourceControlRateLimit.layer,
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: { NEXI_FF_CLOUD_PROJECT_MACHINE: input.enabled === false ? "0" : "1" },
      }),
    ),
    Layer.mock(ProjectService)({
      getById: () => Effect.succeed(Option.some(project)),
      listShells: () => Effect.succeed([project]),
    }),
    Layer.succeed(PullRequestProviderRegistry, {
      get: (requested) => (requested === kind ? provider : null),
      kinds: [provider.kind],
    }),
    Layer.succeed(VcsProcess, {
      run: (command) => {
        commands.push(command);
        if (input.gitError !== undefined) return Effect.fail(input.gitError);
        return Effect.succeed({
          exitCode: ChildProcessSpawner.ExitCode(input.gitExitCode ?? 0),
          stdout:
            typeof input.gitOutput === "function"
              ? input.gitOutput()
              : (input.gitOutput ?? `ref: refs/heads/main\tHEAD\n${remoteCommit}\tHEAD\n`),
          stderr: "",
          stdoutTruncated: input.gitTruncated ?? false,
          stderrTruncated: false,
        });
      },
    }),
  );
  return {
    root,
    project,
    reads,
    commands,
    dependencies,
    layer: Discovery.layer.pipe(Layer.provide(dependencies)),
  };
});
