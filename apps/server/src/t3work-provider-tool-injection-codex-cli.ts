import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { buildT3workProviderToolInjectionPlan } from "./t3work-provider-tool-injection.ts";
import { toMcpAddCommand } from "./t3work-provider-tool-injection-codex-utils.ts";

const CodexMcpListSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  }),
);

const decodeCodexMcpList = Schema.decodeUnknownSync(CodexMcpListSchema);

export class T3workCodexCliError extends Schema.TaggedErrorClass<T3workCodexCliError>()(
  "T3workCodexCliError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class T3workWorkspacePathError extends Schema.TaggedErrorClass<T3workWorkspacePathError>()(
  "T3workWorkspacePathError",
  {
    detail: Schema.String,
  },
) {}

export interface T3workCodexCliApplyInput {
  readonly workspaceRoot: string;
  readonly codexHomeRelativePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly codexBinaryPath?: string;
}

export interface T3workCodexCliApplyResult {
  readonly codexHomePath: string;
  readonly appliedServerNames: ReadonlyArray<string>;
  readonly skippedServerNames: ReadonlyArray<string>;
  readonly codexReloadMcpConfig: boolean;
}

const DEFAULT_WORKSPACE_LOCAL_CODEX_HOME = ".t3work/provider-homes/codex";

export function resolveWorkspaceLocalCodexHomePath(input: {
  readonly workspaceRoot: string;
  readonly codexHomeRelativePath?: string;
}): string {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const requested = (input.codexHomeRelativePath ?? DEFAULT_WORKSPACE_LOCAL_CODEX_HOME).trim();
  if (requested.length === 0) {
    throw new T3workWorkspacePathError({
      detail: "codexHomeRelativePath cannot be empty.",
    });
  }
  if (path.isAbsolute(requested)) {
    throw new T3workWorkspacePathError({
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

  throw new T3workWorkspacePathError({
    detail: "codexHomeRelativePath resolves outside workspaceRoot and is not allowed.",
  });
}

const runCodexCommand = (input: {
  readonly binaryPath: string;
  readonly args: ReadonlyArray<string>;
  readonly codexHomePath: string;
}) =>
  Effect.tryPromise({
    try: () =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          input.binaryPath,
          input.args,
          {
            env: {
              ...process.env,
              CODEX_HOME: input.codexHomePath,
            },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(
                new T3workCodexCliError({
                  detail: `codex ${input.args.join(" ")} failed`,
                  cause: error,
                }),
              );
              return;
            }
            resolve({ stdout, stderr });
          },
        );
      }),
    catch: (cause) =>
      cause instanceof T3workCodexCliError
        ? cause
        : new T3workCodexCliError({
            detail: "Failed to execute codex command.",
            cause,
          }),
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

    return yield* Effect.try({
      try: () => decodeCodexMcpList(JSON.parse(response.stdout)),
      catch: (cause) =>
        new T3workCodexCliError({
          detail: "Failed to decode codex mcp list output.",
          cause,
        }),
    });
  });

export const applyT3workCodexMcpServers = Effect.fn("applyT3workCodexMcpServers")(function* (
  input: T3workCodexCliApplyInput,
) {
  const binaryPath = input.codexBinaryPath?.trim() || "codex";
  const codexHomePath = yield* Effect.try({
    try: () =>
      resolveWorkspaceLocalCodexHomePath({
        workspaceRoot: input.workspaceRoot,
        codexHomeRelativePath: input.codexHomeRelativePath,
      }),
    catch: (cause) =>
      cause instanceof T3workWorkspacePathError
        ? cause
        : new T3workWorkspacePathError({
            detail: "Failed to resolve workspace-local Codex home path.",
          }),
  });
  yield* Effect.try({
    try: () => mkdirSync(codexHomePath, { recursive: true }),
    catch: (cause) =>
      new T3workCodexCliError({
        detail: "Failed to ensure workspace-local Codex home directory.",
        cause,
      }),
  });

  const plan = buildT3workProviderToolInjectionPlan(input.environment);
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
  } satisfies T3workCodexCliApplyResult;
});
