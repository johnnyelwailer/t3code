/**
 * Provider usage-limit sampling — Codex.
 *
 * JSON-RPC `account/rateLimits/read` against a `codex app-server` process.
 * The account state lives only inside an app-server process (it is not
 * persisted on disk), so the sampler spawns a transient one, issues the two
 * requests (`initialize` + the read), and the private scope kills the child
 * when this effect settles.
 *
 * @module t3team-codexUsageSampler
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { resolveSpawnCommand } from "@t3tools/shared/shell";

import { expandHomePath } from "../pathExpansion.ts";
import { buildCodexInitializeParams } from "./Layers/CodexProvider.ts";
import * as CodexClient from "effect-codex-app-server/client";
import { mapCodexRateLimits, type CodexRateLimitsBody } from "./t3team-providerUsageMappers.ts";
import {
  PROVIDER_USAGE_CODEX_DRIVER,
  ProviderUsageSamplerError,
  type ProviderUsageThresholds,
} from "./t3team-providerUsageSampler.ts";

/**
 * Samples the Codex plan limits by speaking `account/rateLimits/read` to a
 * transient `codex app-server` child.
 */
export const sampleCodexUsage = Effect.fn("providerUsageSampler.sampleCodexUsage")(
  function* (input: {
    readonly binaryPath: string;
    readonly homePath?: string;
    readonly providerInstanceId?: ProviderInstanceId;
    readonly thresholds?: ProviderUsageThresholds;
  }) {
    const codexError = (message: string) =>
      new ProviderUsageSamplerError({
        provider: PROVIDER_USAGE_CODEX_DRIVER,
        ...(input.providerInstanceId !== undefined
          ? { providerInstanceId: input.providerInstanceId }
          : {}),
        reason: message,
      });
    const inner = Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
        Scope.close(scope, Exit.void),
      );
      const environment: NodeJS.ProcessEnv = { ...process.env };
      const homePath = input.homePath?.trim();
      if (homePath !== "" && homePath !== undefined) {
        environment.CODEX_HOME = expandHomePath(homePath);
      } else if (process.env.CODEX_HOME === undefined) {
        // No configured home: leave the ambient CODEX_HOME (or its absence) in place.
      }
      const spawnCommand = yield* resolveSpawnCommand(input.binaryPath, ["app-server"], {
        env: environment,
        extendEnv: true,
      });
      const child = yield* spawner
        .spawn(
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            env: environment,
            extendEnv: true,
            forceKillAfter: 5_000,
            shell: spawnCommand.shell,
          }),
        )
        .pipe(
          Effect.provideService(Scope.Scope, scope),
          Effect.mapError((cause) =>
            codexError(`Could not spawn the Codex app-server (${String(cause)}).`),
          ),
        );
      const clientContext = yield* CodexClient.layerChildProcess(child).pipe(
        Layer.build,
        Effect.provideService(Scope.Scope, scope),
      );
      const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
        Effect.provide(clientContext),
      );
      yield* client
        .request("initialize", buildCodexInitializeParams())
        .pipe(
          Effect.mapError((error) =>
            codexError(`Codex app-server initialize failed (${String(error)}).`),
          ),
        );
      const body = yield* client
        .request("account/rateLimits/read", undefined)
        .pipe(
          Effect.mapError((error) =>
            codexError(`Codex rate limit read failed (${String(error)}).`),
          ),
        );
      const sampledAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
      return mapCodexRateLimits(body as CodexRateLimitsBody, {
        provider: PROVIDER_USAGE_CODEX_DRIVER,
        ...(input.providerInstanceId !== undefined
          ? { providerInstanceId: input.providerInstanceId }
          : {}),
        ...(input.thresholds !== undefined ? { thresholds: input.thresholds } : {}),
        sampledAt,
      });
    });
    return yield* inner.pipe(
      Effect.mapError((error) =>
        codexError(error instanceof Error ? error.message : String(error)),
      ),
    );
  },
);
