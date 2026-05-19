import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";

import { buildT3workProviderToolInjectionPlan } from "./t3work-provider-tool-injection.ts";

const UnknownPrettyJson = fromJsonStringPretty(Schema.Unknown);
const encodeUnknownPrettyJson = Schema.encodeEffect(UnknownPrettyJson);

export class T3workOpenCodeConfigError extends Schema.TaggedErrorClass<T3workOpenCodeConfigError>()(
  "T3workOpenCodeConfigError",
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

export interface T3workOpenCodeConfigApplyInput {
  readonly workspaceRoot: string;
  readonly openCodeConfigRelativePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface T3workOpenCodeConfigApplyResult {
  readonly openCodeConfigPath: string;
  readonly appliedServerNames: ReadonlyArray<string>;
  readonly skippedServerNames: ReadonlyArray<string>;
  readonly environmentOverrides: Readonly<Record<string, string>>;
}

const DEFAULT_WORKSPACE_LOCAL_OPENCODE_CONFIG = "opencode.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonComments(input: string): string {
  return input.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|\s)\/\/.*$/gm, "");
}

function parseJsoncObject(raw: string): Record<string, unknown> {
  const normalized = stripJsonComments(raw).trim();
  if (normalized.length === 0) {
    return {};
  }

  const parsed = JSON.parse(normalized);
  return isRecord(parsed) ? parsed : {};
}

export const resolveWorkspaceLocalOpenCodeConfigPath = Effect.fn(
  "resolveWorkspaceLocalOpenCodeConfigPath",
)(function* (input: {
  readonly workspaceRoot: string;
  readonly openCodeConfigRelativePath?: string;
}) {
  const path = yield* Path.Path;
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const requested = (
    input.openCodeConfigRelativePath ?? DEFAULT_WORKSPACE_LOCAL_OPENCODE_CONFIG
  ).trim();

  if (requested.length === 0) {
    return yield* new T3workWorkspacePathError({
      detail: "openCodeConfigRelativePath cannot be empty.",
    });
  }

  if (path.isAbsolute(requested)) {
    return yield* new T3workWorkspacePathError({
      detail:
        "openCodeConfigRelativePath must be workspace-relative, absolute paths are forbidden.",
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

  return yield* new T3workWorkspacePathError({
    detail: "openCodeConfigRelativePath resolves outside workspaceRoot and is not allowed.",
  });
});

const readExistingConfig = Effect.fn("readExistingConfig")(function* (configPath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const raw = yield* fileSystem.readFileString(configPath).pipe(Effect.orElseSucceed(() => ""));
  return parseJsoncObject(raw);
});

export const applyT3workOpenCodeMcpConfig = Effect.fn("applyT3workOpenCodeMcpConfig")(function* (
  input: T3workOpenCodeConfigApplyInput,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const openCodeConfigPath = yield* resolveWorkspaceLocalOpenCodeConfigPath({
    workspaceRoot: input.workspaceRoot,
    ...(input.openCodeConfigRelativePath
      ? { openCodeConfigRelativePath: input.openCodeConfigRelativePath }
      : {}),
  });

  const plan = buildT3workProviderToolInjectionPlan(input.environment);
  const existingConfig = yield* readExistingConfig(openCodeConfigPath);
  const existingMcp = isRecord(existingConfig.mcp) ? existingConfig.mcp : {};

  const nextMcp: Record<string, unknown> = { ...existingMcp };
  const appliedServerNames: string[] = [];
  const skippedServerNames: string[] = [];

  for (const server of plan.openCodeMcpAdds) {
    if (isRecord(nextMcp[server.name])) {
      skippedServerNames.push(server.name);
      continue;
    }

    nextMcp[server.name] = {
      ...server.config,
      ...(server.config.enabled === undefined ? { enabled: true } : {}),
    };
    appliedServerNames.push(server.name);
  }

  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    mcp: nextMcp,
  };
  const encodedConfig = yield* encodeUnknownPrettyJson(nextConfig).pipe(
    Effect.mapError(
      (cause) =>
        new T3workOpenCodeConfigError({
          detail: "Failed to encode workspace-local OpenCode config.",
          cause,
        }),
    ),
  );

  yield* fileSystem.makeDirectory(path.dirname(openCodeConfigPath), { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new T3workOpenCodeConfigError({
          detail: "Failed to ensure workspace-local OpenCode config directory.",
          cause,
        }),
    ),
  );
  yield* fileSystem.writeFileString(openCodeConfigPath, `${encodedConfig}\n`, { flag: "w" }).pipe(
    Effect.mapError(
      (cause) =>
        new T3workOpenCodeConfigError({
          detail: "Failed to write workspace-local OpenCode config.",
          cause,
        }),
    ),
  );

  return {
    openCodeConfigPath,
    appliedServerNames,
    skippedServerNames,
    environmentOverrides: {
      OPENCODE_CONFIG: openCodeConfigPath,
    },
  } satisfies T3workOpenCodeConfigApplyResult;
});
