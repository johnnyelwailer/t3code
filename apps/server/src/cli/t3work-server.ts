import * as Effect from "effect/Effect";
import * as Config from "effect/Config";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import { Command, GlobalFlag } from "effect/unstable/cli";

import { ServerConfig, type StartupPresentation } from "../config.ts";
import { runT3workServer } from "../t3work-server.ts";
import {
  inspectConfiguredWorkspacePacks,
  loadPackAppearanceOverlay,
  loadPackProviderOverlay,
  loadPackWorkflowAgentModelPolicy,
  loadPackWorkflowEphemeralConcurrencyPolicy,
  loadPackWorkflowRepairPolicy,
} from "../t3work-pack-host.ts";
import { setPackAppearanceOverlay } from "../t3work-pack-appearanceOverlay.ts";
import {
  loadPackSetupProfileOverlay,
  setPackSetupProfileOverlay,
} from "../t3work-pack-setupProfileOverlay.ts";
import { setPackProviderOverlay } from "../t3work-pack-providerOverlay.ts";
import { loadPackRecipeSources, setPackRecipeSources } from "../t3work-packRecipeSources.ts";
import { setWorkflowRepairPolicy } from "../t3work-workflowRepairPolicy.ts";
import { setWorkflowAgentModelPolicy } from "../t3work-workflowAgentModelPolicy.ts";
import {
  DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
  setWorkflowEphemeralConcurrencyPolicy,
} from "../t3work-workflowEphemeralConcurrencyPolicy.ts";
import { workflowAdmissionQueue } from "../t3work-workflowAdmissionQueue.ts";
import { type CliServerFlags, resolveServerConfig, sharedServerCommandFlags } from "./config.ts";

class WorkspacePackLoadError extends Data.TaggedError("WorkspacePackLoadError")<{
  readonly cause: unknown;
}> {}

export const runT3workServerCommand = (
  flags: CliServerFlags,
  options?: {
    readonly startupPresentation?: StartupPresentation;
    readonly forceAutoBootstrapProjectFromCwd?: boolean;
  },
) =>
  Effect.gen(function* () {
    const logLevel = yield* GlobalFlag.LogLevel;
    const config = yield* resolveServerConfig(flags, logLevel, options);
    const workspacePacksDir = yield* Config.string("T3WORK_PACKS_DIR").pipe(Config.option);
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
      const appearanceOverlay = yield* Effect.tryPromise({
        try: () => loadPackAppearanceOverlay(packDiagnostic),
        catch: (cause) => new WorkspacePackLoadError({ cause }),
      }).pipe(
        Effect.tap((overlay) => Effect.sync(() => setPackAppearanceOverlay(overlay))),
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
        Effect.tap((overlay) => Effect.sync(() => setPackProviderOverlay(overlay))),
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
        Effect.tap((profiles) => Effect.sync(() => setPackSetupProfileOverlay(profiles))),
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
        Effect.tap((policy) => Effect.sync(() => setWorkflowRepairPolicy(policy ?? {}))),
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
        Effect.tap((policy) => Effect.sync(() => setWorkflowAgentModelPolicy(policy ?? "inherit"))),
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
            setWorkflowEphemeralConcurrencyPolicy(
              policy ?? { maxActiveSteps: DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS },
            );
            workflowAdmissionQueue.reconfigure();
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
        providerInstances: providerOverlay ? Object.keys(providerOverlay).sort() : [],
        activeTheme: appearanceOverlay?.themeId,
        setupProfiles: setupProfileOverlay?.map((profile) => profile.id) ?? [],
      });
    }
    return yield* runT3workServer.pipe(Effect.provideService(ServerConfig, config));
  });

export const t3workStartCommand = Command.make("start", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription("Run the T3work server."),
  Command.withHandler((flags) => runT3workServerCommand(flags)),
);

export const t3workServeCommand = Command.make("serve", { ...sharedServerCommandFlags }).pipe(
  Command.withDescription(
    "Run the T3work server without opening a browser and print headless pairing details.",
  ),
  Command.withHandler((flags) =>
    runT3workServerCommand(flags, {
      startupPresentation: "headless",
      forceAutoBootstrapProjectFromCwd: false,
    }),
  ),
);
