import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { buildT3workProviderToolInjectionPlan } from "./t3work-provider-tool-injection.ts";

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

export function resolveWorkspaceLocalOpenCodeConfigPath(input: {
  readonly workspaceRoot: string;
  readonly openCodeConfigRelativePath?: string;
}): string {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const requested = (
    input.openCodeConfigRelativePath ?? DEFAULT_WORKSPACE_LOCAL_OPENCODE_CONFIG
  ).trim();

  if (requested.length === 0) {
    throw new T3workWorkspacePathError({
      detail: "openCodeConfigRelativePath cannot be empty.",
    });
  }

  if (path.isAbsolute(requested)) {
    throw new T3workWorkspacePathError({
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

  throw new T3workWorkspacePathError({
    detail: "openCodeConfigRelativePath resolves outside workspaceRoot and is not allowed.",
  });
}

function readExistingConfig(configPath: string): Record<string, unknown> {
  try {
    return parseJsoncObject(readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

export const applyT3workOpenCodeMcpConfig = Effect.fn("applyT3workOpenCodeMcpConfig")(function* (
  input: T3workOpenCodeConfigApplyInput,
) {
  const openCodeConfigPath = yield* Effect.try({
    try: () =>
      resolveWorkspaceLocalOpenCodeConfigPath({
        workspaceRoot: input.workspaceRoot,
        openCodeConfigRelativePath: input.openCodeConfigRelativePath,
      }),
    catch: (cause) =>
      cause instanceof T3workWorkspacePathError
        ? cause
        : new T3workWorkspacePathError({
            detail: "Failed to resolve workspace-local OpenCode config path.",
          }),
  });

  const plan = buildT3workProviderToolInjectionPlan(input.environment);
  const existingConfig = readExistingConfig(openCodeConfigPath);
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

  yield* Effect.try({
    try: () => {
      mkdirSync(path.dirname(openCodeConfigPath), { recursive: true });
      writeFileSync(openCodeConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    },
    catch: (cause) =>
      new T3workOpenCodeConfigError({
        detail: "Failed to write workspace-local OpenCode config.",
        cause,
      }),
  });

  return {
    openCodeConfigPath,
    appliedServerNames,
    skippedServerNames,
    environmentOverrides: {
      OPENCODE_CONFIG: openCodeConfigPath,
    },
  } satisfies T3workOpenCodeConfigApplyResult;
});
