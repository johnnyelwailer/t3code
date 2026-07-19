import {
  activateWorkspacePack,
  decodeSetupProfileDefinition,
  type SetupProfileDefinition,
} from "@t3work/packs";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import type { T3WorkProfile } from "@t3tools/t3work-skill-packs";

import type { WorkspacePackHostDiagnostic } from "./t3work-pack-host.ts";

const SETUP_PROFILE_CAPABILITY = "setup-profile:v1";

let overlay: readonly SetupProfileDefinition[] | undefined;

export function setPackSetupProfileOverlay(
  profiles: readonly SetupProfileDefinition[] | undefined,
): void {
  overlay = profiles && profiles.length > 0 ? profiles : undefined;
}

/** Full definitions (incl. behavior) for the server-side profile resolver. */
export function getPackSetupProfiles(): readonly SetupProfileDefinition[] | undefined {
  return overlay;
}

/** Behavior view mapped to the skill-packs profile shape for the setup resolver. */
export function getPackProfilesForResolver(): Readonly<Record<string, T3WorkProfile>> | undefined {
  if (!overlay) return undefined;
  const map: Record<string, T3WorkProfile> = {};
  for (const profile of overlay) {
    map[profile.id] = {
      id: profile.id,
      title: profile.title,
      description: profile.description,
      audience: profile.audience,
      ...(profile.tags ? { tags: profile.tags } : {}),
      communicationStyle: profile.communicationStyle,
      preferredArtifactKinds: profile.preferredArtifactKinds,
      ...(profile.defaultActionFamilies
        ? { defaultActionFamilies: profile.defaultActionFamilies }
        : {}),
      defaultRecipeWeights: profile.recipeWeights,
      recommendedSkillPackIds: profile.recommendedSkillPackIds,
      hideImplementationComplexity: profile.hideImplementationComplexity,
    };
  }
  return map;
}

/** Presentation subset for the environment descriptor served to the web wizard. */
export function getPackSetupProfileDescriptors(): readonly EnvironmentSetupProfile[] | undefined {
  return overlay?.map((profile) => ({
    id: profile.id,
    title: profile.title,
    description: profile.description,
    badge: profile.badge,
    bullets: profile.bullets,
    category: profile.category,
    ...(profile.iconDataUrl ? { iconDataUrl: profile.iconDataUrl } : {}),
    ...(profile.default ? { default: true } : {}),
  }));
}

/**
 * Activates each pack with an entrypoint and collects `defineSetupProfile` calls.
 * Registering a profile requires the `setup-profile:v1` capability (peer to
 * `theme:v1`); definitions are schema-validated before use.
 */
export const loadPackSetupProfileOverlay = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<readonly SetupProfileDefinition[]> => {
  const packs = (diagnostic.resolution?.packs ?? []).filter((pack) =>
    Boolean(pack.manifest.entrypoints?.activate),
  );
  const collected: SetupProfileDefinition[] = [];
  for (const pack of packs) {
    await activateWorkspacePack(pack, {
      defineAgentProvider: () => undefined,
      defineProviderDriver: () => undefined,
      defineTheme: () => undefined,
      defineSetupProfile: (definition) => {
        if (!pack.manifest.capabilities.includes(SETUP_PROFILE_CAPABILITY)) {
          throw new Error(
            `Pack ${pack.manifest.id} defines a setup profile without ${SETUP_PROFILE_CAPABILITY} capability`,
          );
        }
        collected.push(decodeSetupProfileDefinition(definition));
      },
      defineWorkflowRepairPolicy: () => undefined,
      defineWorkflowAgentModelPolicy: () => undefined,
      defineWorkflowEphemeralConcurrencyPolicy: () => undefined,
      resolveAssetDataUrl: async () => {
        throw new Error("Asset resolution is only available to pack activation code");
      },
    });
  }
  return collected;
};
