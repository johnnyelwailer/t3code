import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ProcessRunner } from "./processRunner.ts";
import { buildT3TeamProviderToolInjectionPlan } from "./t3team-provider-tool-injection.ts";
import { toMcpAddCommand } from "./t3team-provider-tool-injection-codex-utils.ts";

const CodexMcpListSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  }),
);

const decodeCodexMcpList = Schema.decodeEffect(Schema.fromJsonString(CodexMcpListSchema));

export class T3TeamCodexCliError extends Schema.TaggedErrorClass<T3TeamCodexCliError>()(
  "T3TeamCodexCliError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class T3TeamWorkspacePathError extends Schema.TaggedErrorClass<T3TeamWorkspacePathError>()(
  "T3TeamWorkspacePathError",
  {
    detail: Schema.String,
  },
) {}

export interface T3TeamCodexCliApplyInput {
  readonly workspaceRoot: string;
  readonly codexHomeRelativePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly codexBinaryPath?: string;
}

export interface T3TeamCodexCliApplyResult {
  readonly codexHomePath: string;
  readonly appliedServerNames: ReadonlyArray<string>;
  readonly skippedServerNames: ReadonlyArray<string>;
  readonly codexReloadMcpConfig: boolean;
}

const DEFAULT_WORKSPACE_LOCAL_CODEX_HOME = ".t3team/provider-homes/codex";

export const resolveWorkspaceLocalCodexHomePath = Effect.fn("resolveWorkspaceLocalCodexHomePath")(
  function* (input: { readonly workspaceRoot: string; readonly codexHomeRelativePath?: string }) {
    const path = yield* Path.Path;
    const workspaceRoot = path.resolve(input.workspaceRoot);
    const requested = (input.codexHomeRelativePath ?? DEFAULT_WORKSPACE_LOCAL_CODEX_HOME).trim();
    if (requested.length === 0) {
      return yield* new T3TeamWorkspacePathError({
        detail: "codexHomeRelativePath cannot be empty.",
      });
    }
    if (path.isAbsolute(requested)) {
      return yield* new T3TeamWorkspacePathError({
        detail: "codexHomeRelativePath must be workspace-relative, absolute paths are forbidden.",
      });
    }

    const resolved = path.resolve(workspaceRoot, requested);
    const relative = path.relative(workspaceRoot, resolved);
    if (
      relative === "" ||
      relative === "." ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    ) {
      return resolved;
    }

    return yield* new T3TeamWorkspacePathError({
      detail: "codexHomeRelativePath resolves outside workspaceRoot and is not allowed.",
    });
  },
);

const runCodexCommand = Effect.fn("runCodexCommand")(function* (input: {
  readonly binaryPath: string;
  readonly args: ReadonlyArray<string>;
  readonly codexHomePath: string;
}) {
  const processRunner = yield* ProcessRunner;
  const result = yield* processRunner
    .run({
      command: input.binaryPath,
      args: input.args,
      env: {
        ...process.env,
        CODEX_HOME: input.codexHomePath,
      },
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new T3TeamCodexCliError({
            detail: "Failed to execute codex command.",
            cause,
          }),
      ),
    );

  if (result.code !== 0) {
    return yield* new T3TeamCodexCliError({
      detail: `codex ${input.args.join(" ")} failed`,
      cause: result.stderr.trim() || result.stdout.trim() || result.code,
    });
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

const listCodexMcpServers = (input: {
  readonly binaryPath: string;
  readonly codexHomePath: string;
}) =>
  Effect.gen(function* () {
    const response = yield* runCodexCommand({
      binaryPath: input.binaryPath,
      args: ["mcp", "list", "--json"],
      codexHomePath: input.codexHomePath,
    });

    return yield* decodeCodexMcpList(response.stdout).pipe(
      Effect.mapError(
        (cause) =>
          new T3TeamCodexCliError({
            detail: "Failed to decode codex mcp list output.",
            cause,
          }),
      ),
    );
  });

export const applyT3TeamCodexMcpServers = Effect.fn("applyT3TeamCodexMcpServers")(function* (
  input: T3TeamCodexCliApplyInput,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const binaryPath = input.codexBinaryPath?.trim() || "codex";
  const codexHomePath = yield* resolveWorkspaceLocalCodexHomePath({
    workspaceRoot: input.workspaceRoot,
    ...(input.codexHomeRelativePath ? { codexHomeRelativePath: input.codexHomeRelativePath } : {}),
  });
  yield* fileSystem.makeDirectory(codexHomePath, { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new T3TeamCodexCliError({
          detail: "Failed to ensure workspace-local Codex home directory.",
          cause,
        }),
    ),
  );

  const plan = buildT3TeamProviderToolInjectionPlan(input.environment);
  const existing = yield* listCodexMcpServers({
    binaryPath,
    codexHomePath,
  });
  const existingNames = new Set(existing.map((entry) => entry.name));

  const appliedServerNames: string[] = [];
  const skippedServerNames: string[] = [];

  for (const server of plan.codexMcpAdds) {
    const commandSpec = toMcpAddCommand(server.config);
    if (!commandSpec || existingNames.has(server.name)) {
      skippedServerNames.push(server.name);
      continue;
    }

    const args = [
      "mcp",
      "add",
      server.name,
      ...commandSpec.envEntries.flatMap((entry) => ["--env", entry]),
      "--",
      commandSpec.command,
      ...commandSpec.args,
    ];

    yield* runCodexCommand({
      binaryPath,
      args,
      codexHomePath,
    });

    appliedServerNames.push(server.name);
  }

  return {
    codexHomePath,
    appliedServerNames,
    skippedServerNames,
    codexReloadMcpConfig: plan.codexReloadMcpConfig,
  } satisfies T3TeamCodexCliApplyResult;
});
