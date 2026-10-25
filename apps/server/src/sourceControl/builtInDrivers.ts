import type {
  SourceControlDriver,
  SourceControlDriverInstance,
} from "@t3tools/source-control-core/server/driver";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as GitHubDriver from "@t3tools/source-control-github/server/driver";
import * as T3TeamGitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSourceControlHost from "./ServerSourceControlHost.ts";
import { BUILT_IN_SOURCE_CONTROL_DRIVER_LIST } from "./sourceControlDefinitions.ts";

export interface SourceControlDriverEntry {
  readonly driver: Pick<SourceControlDriver, "kind" | "definition">;
  readonly instance: SourceControlDriverInstance;
}

/** Every driver's instance, in registry order. Everything that reads a host reads it here. */
export class SourceControlDrivers extends Context.Service<
  SourceControlDrivers,
  ReadonlyArray<SourceControlDriverEntry>
>()("t3/sourceControl/builtInDrivers/SourceControlDrivers") {}

const make = Effect.forEach(BUILT_IN_SOURCE_CONTROL_DRIVER_LIST, (driver) =>
  Effect.gen(function* () {
    const instance: SourceControlDriverInstance =
      driver === GitHubDriver.driver
        ? yield* GitHubDriver.makeOverServerTransport
        : yield* driver.make;
    return { driver, instance };
  }),
);

/**
 * The GitHub transport with the credential, quota and pause its readers share: upstream's
 * `GitHubRest.layerWithDependencies` plus the fork's `GitHubApi` facade over it (t3team).
 */
type GitHubTransportLayer = typeof T3TeamGitHubApi.layerWithDependencies;

/**
 * `gitHubTransport` is the one GitHub transport every GitHub reader shares (its quota reserve,
 * rate-limit pause and read coalescer): the GitHub driver runs over it rather than building its
 * own, and it is exposed so the fork's `GitHubApi` readers use the same instance. A caller that
 * already holds the server's instance passes it so it is not built a second time (t3team).
 */
export const makeLayer = (
  gitHubTransport: GitHubTransportLayer = T3TeamGitHubApi.layerWithDependencies,
) =>
  Layer.effect(SourceControlDrivers, make).pipe(
    Layer.provideMerge(gitHubTransport),
    Layer.provideMerge(ServerSourceControlHost.layer),
    Layer.provideMerge(SourceControlRateLimit.layer),
  );

export const layer = makeLayer();
