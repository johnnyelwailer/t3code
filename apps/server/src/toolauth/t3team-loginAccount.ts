/**
 * Sign-in binary and env from the same account settings status and runs use.
 * PATH+PATHEXT only when no binary is set; a missing configured path is a
 * failed state, not a PATH fallback or auto-opened dialog.
 * @module toolauth/loginAccount
 */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { isCommandAvailable, resolveSpawnCommand } from "@t3tools/shared/shell";
import { ToolAuthSpawnError } from "@t3tools/contracts";
import type { ProviderInstanceEnvironment } from "@t3tools/contracts";

import { makeClaudeEnvironment } from "../provider/Drivers/ClaudeHome.ts";
import { ptyCommandForResolved } from "./t3team-loginPtyCommand.ts";
import type { ActiveSession } from "./t3team-ToolAuthService.ts";
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

/** Default PATH name when the instance has no binary path of its own. */
const DEFAULT_BINARY_BY_TOOL: Readonly<Record<string, string>> = {
  claude: "claude",
  codex: "codex",
};

export interface LoginAccountSettings {
  readonly instanceId?: string | undefined;
  /** Raw `binaryPath` from the instance. Empty or the driver default means not configured. */
  readonly binaryPath: string;
  readonly homePath: string;
  readonly instanceEnvironment?: ProviderInstanceEnvironment | undefined;
}

export function isConfiguredBinaryPath(binaryPath: string, defaultName: string): boolean {
  const trimmed = binaryPath.trim();
  return trimmed.length > 0 && trimmed !== defaultName;
}

export function adapterForAccount(
  adapter: ToolAuthAdapter,
  binary: string,
  spawnEnv: NodeJS.ProcessEnv,
): ToolAuthAdapter {
  const probe = adapter.status.probe;
  return {
    ...adapter,
    command: [binary, ...adapter.command.slice(1)],
    status:
      probe && probe.length > 0
        ? { ...adapter.status, probe: [binary, ...probe.slice(1)] }
        : adapter.status,
    spawnEnv: { ...adapter.spawnEnv, ...stringEnv(spawnEnv) },
  };
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string") out[name] = value;
  }
  return out;
}

const resolveLoginSpawnEnv = Effect.fn("toolauth.resolveLoginSpawnEnv")(function* (
  tool: string,
  account: LoginAccountSettings | undefined,
  baseEnv: NodeJS.ProcessEnv,
) {
  const withInstance = yield* mergeProviderInstanceEnvironment(
    account?.instanceEnvironment,
    baseEnv,
  );
  const homePath = account?.homePath ?? "";
  if (tool === "claude") {
    return yield* makeClaudeEnvironment({ homePath }, withInstance);
  }
  if (tool === "codex" && homePath.trim().length > 0) {
    const path = yield* Path.Path;
    const home = yield* HostProcess.HomeDirectory;
    return { ...withInstance, CODEX_HOME: path.resolve(expandHomePath(homePath, home)) };
  }
  return withInstance;
});

function missingConfiguredBinaryState(
  tool: string,
  adapter: ToolAuthAdapter,
  binary: string,
  instanceId: string | undefined,
): AuthState {
  return {
    tool,
    phase: "failed",
    reason: "configuredBinaryMissing",
    message: `${adapter.label} could not use the binary set for this account at ${binary}. Check the path in provider settings, then try again.`,
    ...(adapter.hostname === undefined ? {} : { hostname: adapter.hostname }),
    ...(instanceId === undefined ? {} : { instanceId }),
  };
}

function notInstalledState(tool: string, adapter: ToolAuthAdapter, shell: string): AuthState {
  return {
    tool,
    phase: "failed",
    reason: "notInstalled",
    message: `${shell} is not installed on this machine. Install it on the host, then try again.`,
    ...(adapter.hostname === undefined ? {} : { hostname: adapter.hostname }),
  };
}

function withInstanceId(state: AuthState, instanceId: string | undefined): AuthState {
  return instanceId === undefined ? state : { ...state, instanceId };
}

const prepareLoginSpawn = Effect.fn("toolauth.prepareLoginSpawn")(function* (input: {
  readonly tool: string;
  readonly adapter: ToolAuthAdapter;
  readonly account: LoginAccountSettings | undefined;
  readonly env: NodeJS.ProcessEnv;
  readonly checkBinaryAvailable: (binary: string) => Effect.Effect<boolean>;
}) {
  const platform = yield* HostProcess.Platform;
  const home = yield* HostProcess.HomeDirectory;
  const defaultName = DEFAULT_BINARY_BY_TOOL[input.tool] ?? input.adapter.command[0]!;
  const rawBinary = input.account?.binaryPath ?? "";
  const configured = isConfiguredBinaryPath(rawBinary, defaultName);
  const binary = configured ? expandHomePath(rawBinary, home) : defaultName;
  const accountEnv = yield* resolveLoginSpawnEnv(input.tool, input.account, input.env);
  const spawnEnv = { ...accountEnv, ...input.adapter.spawnEnv };
  const adapter = adapterForAccount(input.adapter, binary, spawnEnv);
  const instanceId = input.account?.instanceId;

  if (configured) {
    const available = yield* isCommandAvailable(binary, { env: spawnEnv });
    if (!available) {
      return {
        kind: "failed" as const,
        adapter,
        state: missingConfiguredBinaryState(input.tool, adapter, binary, instanceId),
      };
    }
  } else if (!(yield* input.checkBinaryAvailable(binary))) {
    return {
      kind: "failed" as const,
      adapter,
      state: withInstanceId(notInstalledState(input.tool, adapter, binary), instanceId),
    };
  }

  const [shell, ...args] = adapter.command;
  const resolved = yield* resolveSpawnCommand(shell!, args, { env: spawnEnv });
  return {
    kind: "ready" as const,
    adapter,
    spawnEnv,
    instanceId,
    ptyCommand: ptyCommandForResolved(resolved, platform),
  };
});

export const beginLoginSpawn = Effect.fn("toolauth.beginLoginSpawn")(function* (input: {
  readonly tool: string;
  readonly adapter: ToolAuthAdapter;
  readonly account: LoginAccountSettings | undefined;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
  readonly ptyAdapter: PtyAdapter.PtyAdapter["Service"];
  readonly checkBinaryAvailable: (binary: string) => Effect.Effect<boolean>;
  readonly sessionsRef: SynchronizedRef.SynchronizedRef<Map<string, ActiveSession>>;
  readonly notifyUpdate: (state: AuthState) => Effect.Effect<void>;
}) {
  const prepared = yield* prepareLoginSpawn(input);
  const instanceId = input.account?.instanceId;
  if (prepared.kind === "failed") {
    yield* SynchronizedRef.update(input.sessionsRef, (sessions) => {
      const next = new Map(sessions);
      next.set(input.tool, { adapter: prepared.adapter, state: prepared.state });
      return next;
    });
    yield* input.notifyUpdate(prepared.state);
    return { kind: "failed" as const, state: prepared.state };
  }

  const initialState: AuthState = withInstanceId(
    {
      tool: input.tool,
      phase: "starting",
      ...(input.adapter.hostname === undefined ? {} : { hostname: input.adapter.hostname }),
    },
    instanceId,
  );

  const process = yield* input.ptyAdapter
    .spawn({
      shell: prepared.ptyCommand.shell,
      args: [...prepared.ptyCommand.args],
      cwd: input.homeDir,
      cols: 80,
      rows: 30,
      env: prepared.spawnEnv,
    })
    .pipe(Effect.mapError((cause) => new ToolAuthSpawnError({ tool: input.tool, cause })));

  yield* SynchronizedRef.update(input.sessionsRef, (sessions) => {
    const next = new Map(sessions);
    next.set(input.tool, { adapter: prepared.adapter, process, state: initialState });
    return next;
  });
  yield* input.notifyUpdate(initialState);
  return { kind: "ready" as const, process, adapter: prepared.adapter, state: initialState };
});
