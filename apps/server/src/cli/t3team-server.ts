import * as Effect from "effect/Effect";
import * as Config from "effect/Config";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import { Command, GlobalFlag } from "effect/unstable/cli";

import { ServerConfig, type StartupPresentation } from "../config.ts";
// One server layer, two binaries. `server.ts` already composes every t3team route and reactor,
// so the `t3team` binary differs from `t3` only in the pack bootstrapping this CLI file does
// before launch. The former `t3team-server.ts` was a hand-maintained copy of `server.ts` and
// silently drifted on every upstream sync (it lost BackgroundPolicy/ResourceTelemetry/Usage in
// the 2026-08 sync); it is gone, and with it the "register the route in BOTH registries" trap.
import { runServer } from "../server.ts";
import { activateCompiledInDistribution } from "../t3team-distribution-bootstrap.ts";
import {
  inspectConfiguredWorkspacePacks,
  loadPackAppearanceOverlay,
  loadPackProviderOverlay,
  loadPackWorkflowAgentModelPolicy,
  loadPackWorkflowEphemeralConcurrencyPolicy,
  loadPackWorkflowRepairPolicy,
} from "../t3team-pack-host.ts";
import { setPackAppearanceOverlay } from "../t3team-pack-appearanceOverlay.ts";
import {
  loadPackSetupProfileOverlay,
  setPackSetupProfileOverlay,
} from "../t3team-pack-setupProfileOverlay.ts";
import { setPackProviderOverlay } from "../t3team-pack-providerOverlay.ts";
import { loadPackRecipeSources, setPackRecipeSources } from "../t3team-packRecipeSources.ts";
import { setWorkflowRepairPolicy } from "../t3team-workflowRepairPolicy.ts";
import { setWorkflowAgentModelPolicy } from "../t3team-workflowAgentModelPolicy.ts";
import { setWorkflowEphemeralConcurrencyPolicy } from "../t3team-workflowEphemeralConcurrencyPolicy.ts";
import { workflowAdmissionQueue } from "../t3team-workflowAdmissionQueue.ts";
import {
  type CliServerFlags,
  resolveEphemeralWorkflowMaxActiveStepsOverride,
  resolveEphemeralWorkflowMaxLiveRunsOverride,
  resolveServerConfig,
  sharedServerCommandFlags,
} from "./config.ts";

class WorkspacePackLoadError extends Data.TaggedError("WorkspacePackLoadError")<{
  readonly cause: unknown;
}> {}

class CompiledInDistributionError extends Data.TaggedError("CompiledInDistributionError")<{
  readonly cause: unknown;
}> {}

export const runT3TeamServerCommand = (
  flags: CliServerFlags,
  options?: {
    readonly startupPresentation?: StartupPresentation;
  },
) =>
  Effect.gen(function* () {
    const logLevel = yield* GlobalFlag.LogLevel;
    const config = yield* resolveServerConfig(flags, logLevel, options);
    // 1. Compiled-in distribution = the baseline layer (inlined at build time). It runs before any
    // post-install pack so a runtime pack can override it for the content it actually provides. A
    // bad distribution must not lock the user out of the host, so a failure is a warning, not fatal.
    yield* Effect.tryPromise({
      try: () => activateCompiledInDistribution(),
      catch: (cause) => new CompiledInDistributionError({ cause }),
    }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("Compiled-in distribution activation failed; continuing without it", {
          cause,
        }),
      ),
    );
    const workspacePacksDir = yield* Config.string("T3TEAM_PACKS_DIR").pipe(Config.option);
    const packDiagnostic = yield* Effect.promise(() =>
      inspectConfiguredWorkspacePacks(Option.getOrUndefined(workspacePacksDir)),
    );
    if (packDiagnostic.enabled) {
      // Pack recipe roots (Epic 16 §Recipe Sources And Precedence). Pure resolution — the recipes
      // themselves load lazily through the shared discovery pipeline on each discover request.
      const recipeSources = loadPackRecipeSources(packDiagnostic);
      setPackRecipeSources(recipeSources);
      for (const diagnostic of recipeSources.diagnostics) {
        yield* Effect.logWarning("Workspace pack recipe source skipped", { diagnostic });
      }
      // Each overlay is applied only when the runtime layer actually provides that content, so an
      // empty (or content-less) packs dir never wipes the compiled-in distribution baseline.
      const appearanceOverlay = yield* Effect.tryPromise({
        try: () => loadPackAppearanceOverlay(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((overlay) =>
          Effect.sync(() => {
            if (overlay !== undefined) setPackAppearanceOverlay(overlay);
          }),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("Workspace pack theme loading failed", { cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );
      const providerOverlay = yield* Effect.tryPromise({
        try: () => loadPackProviderOverlay(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((overlay) =>
          Effect.sync(() => {
            if (Object.keys(overlay.configMap).length > 0 || overlay.driverDefinitions.size > 0) {
              setPackProviderOverlay(overlay);
            }
          }),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("Workspace pack provider loading failed", { cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );
      const setupProfileOverlay = yield* Effect.tryPromise({
        try: () => loadPackSetupProfileOverlay(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((profiles) =>
          Effect.sync(() => {
            if (profiles.length > 0) setPackSetupProfileOverlay(profiles);
          }),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("Workspace pack setup profile loading failed", { cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );
      yield* Effect.tryPromise({
        try: () => loadPackWorkflowRepairPolicy(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((policy) =>
          Effect.sync(() => {
            if (policy !== undefined) setWorkflowRepairPolicy(policy);
          }),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("Workspace pack workflow repair policy loading failed", { cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );
      yield* Effect.tryPromise({
        try: () => loadPackWorkflowAgentModelPolicy(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((policy) =>
          Effect.sync(() => {
            if (policy !== undefined) setWorkflowAgentModelPolicy(policy);
          }),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("Workspace pack workflow agent model policy loading failed", {
            cause,
          }).pipe(Effect.as(undefined)),
        ),
      );
      yield* Effect.tryPromise({
        try: () => loadPackWorkflowEphemeralConcurrencyPolicy(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((policy) =>
          Effect.sync(() => {
            if (policy !== undefined) {
              setWorkflowEphemeralConcurrencyPolicy(policy);
              workflowAdmissionQueue.reconfigure();
            }
          }),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("Workspace pack ephemeral workflow concurrency policy loading failed", {
            cause,
          }).pipe(Effect.as(undefined)),
        ),
      );
      yield* Effect.logInfo("Workspace pack discovery completed", {
        root: packDiagnostic.root,
        packs: (packDiagnostic.resolution?.packs ?? []).map((pack) => ({
          id: pack.manifest.id,
          version: pack.manifest.version,
          scope: pack.manifest.scope ?? "distribution",
        })),
        locks: Object.keys(packDiagnostic.resolution?.locks ?? {}).sort(),
        diagnostics: packDiagnostic.resolution?.diagnostics ?? [],
        issues: packDiagnostic.issues,
        providerInstances: providerOverlay ? Object.keys(providerOverlay.configMap).sort() : [],
        activeTheme: appearanceOverlay?.themeId,
        setupProfiles: setupProfileOverlay?.map((profile) => profile.id) ?? [],
      });
    }
    // Applied LAST — after both the compiled-in distribution (step 1, above) and any workspace
    // pack (just above) have had their say — so an explicit operator override (CLI flag or env
    // var) always wins, regardless of which pack source set a policy or in what order.
    // `setWorkflowEphemeralConcurrencyPolicy` merges, so passing only the fields that actually
    // have an override never clobbers whatever the pack set for the other one.
    const ephemeralWorkflowMaxActiveSteps =
      yield* resolveEphemeralWorkflowMaxActiveStepsOverride(flags);
    const ephemeralWorkflowMaxLiveRuns = yield* resolveEphemeralWorkflowMaxLiveRunsOverride(flags);
    if (ephemeralWorkflowMaxActiveSteps !== undefined || ephemeralWorkflowMaxLiveRuns !== undefined) {
      setWorkflowEphemeralConcurrencyPolicy({
        ...(ephemeralWorkflowMaxActiveSteps === undefined
          ? {}
          : { maxActiveSteps: ephemeralWorkflowMaxActiveSteps }),
        ...(ephemeralWorkflowMaxLiveRuns === undefined
          ? {}
          : { maxLiveRuns: ephemeralWorkflowMaxLiveRuns }),
      });
      workflowAdmissionQueue.reconfigure();
    }
    return yield* runServer.pipe(Effect.provideService(ServerConfig, config));
  });

export const t3teamStartCommand = Command.make("start", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription("Run the T3Team server."),
  Command.withHandler((flags) => runT3TeamServerCommand(flags)),
);

export const t3teamServeCommand = Command.make("serve", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription(
    "Run the T3Team server without opening a browser and print headless pairing details.",
  ),
  Command.withHandler((flags) =>
    runT3TeamServerCommand(flags, {
      startupPresentation: "headless",
    }),
  ),
);
