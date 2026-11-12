/**
 * What a `remoteEnvironment` provider instance reports about itself (`t3team-remoteEnvironmentDriver.ts`):
 * a snapshot that is disabled with no models, so pickers and settings never offer it, and a text
 * generation service that fails every operation.
 */
import { TextGenerationError, type ServerProvider } from "@t3tools/contracts";
import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import { makeManualOnlyProviderMaintenanceCapabilities } from "@t3tools/provider-core/server/maintenanceResolver";
import type { ManagedServerProvider } from "@t3tools/provider-core/server/snapshot";
import { buildServerProvider } from "@t3tools/provider-core/server/snapshotProbe";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";
import type { TextGeneration } from "./textGeneration/TextGeneration.ts";

export const DISPLAY_NAME = "Remote environment";

export const unsupportedTextGeneration: TextGeneration["Service"] = (() => {
  const fail = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: "A remote environment instance does not generate text here.",
      }),
    );
  return {
    generateCommitMessage: () => fail("generateCommitMessage"),
    generatePrContent: () => fail("generatePrContent"),
    generateBranchName: () => fail("generateBranchName"),
    generateThreadTitle: () => fail("generateThreadTitle"),
    generateReviewGuide: () => fail("generateReviewGuide"),
  };
})();

export const makeSnapshot = (
  instanceId: ProviderInstance["instanceId"],
  continuationKey: string,
): ManagedServerProvider => {
  const getSnapshot = Effect.map(DateTime.now, (now): ServerProvider => ({
    ...buildServerProvider({
      driver: REMOTE_ENVIRONMENT_DRIVER,
      presentation: { displayName: DISPLAY_NAME, showInteractionModeToggle: false },
      enabled: false,
      checkedAt: DateTime.formatIso(now),
      models: [],
      probe: {
        installed: true,
        version: null,
        status: "ready",
        auth: { status: "unknown" },
        message: "Runs delegated children on cloud sessions; not offered for new threads.",
      },
    }),
    instanceId,
    driver: REMOTE_ENVIRONMENT_DRIVER,
    availability: "available",
    continuation: { groupKey: continuationKey },
  }));
  return {
    resolveMaintenance: () =>
      Effect.succeed(
        makeManualOnlyProviderMaintenanceCapabilities({
          provider: REMOTE_ENVIRONMENT_DRIVER,
          packageName: null,
        }),
      ),
    getSnapshot,
    refresh: getSnapshot,
    applyUsageLimits: () => Effect.void,
    streamChanges: Stream.empty,
  };
};
