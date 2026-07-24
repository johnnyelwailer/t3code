import { matchRecipes } from "@t3tools/project-recipes";
import {
  getT3TeamProfile,
  getT3TeamSkillPack,
  listBundledT3TeamRecipes,
  resolveEnabledSkillPackIds,
  toRecipeProfileContext,
  type T3TeamProfile,
  type T3TeamSkillPack,
} from "@t3tools/t3team-skill-packs";

export type T3TeamProjectSetupConfirmPreview = {
  readonly profile: T3TeamProfile;
  readonly enabledSkillPackIds: ReadonlyArray<string>;
  readonly skillPacks: ReadonlyArray<T3TeamSkillPack>;
  readonly topRecipes: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly reason: string;
  }>;
};

export function buildT3TeamProjectSetupConfirmPreview(input: {
  readonly profileId: string;
  readonly customProfile?: T3TeamProfile | undefined;
}): T3TeamProjectSetupConfirmPreview {
  const profile = input.customProfile ?? getT3TeamProfile(input.profileId);
  const enabledSkillPackIds = resolveEnabledSkillPackIds({ profile });
  const skillPacks = enabledSkillPackIds.flatMap((packId) => {
    const pack = getT3TeamSkillPack(packId);
    return pack ? [pack] : [];
  });

  const topRecipes = matchRecipes(listBundledT3TeamRecipes(), {
    activeProject: { source: { provider: "atlassian" } },
    selectedResource: null,
    resourceKind: "ticket",
    availableIntegrations: ["atlassian"],
    surface: "workitem.detail.sidepanel",
    enabledSkillPacks: enabledSkillPackIds,
    profile: toRecipeProfileContext(profile),
    availableContextKeys: [
      "ticket.summary",
      "project.summary",
      "ticket.context.pre-implementation",
    ],
  })
    .filter((result) => result.missingContext.length === 0)
    .slice(0, 5)
    .map((result) => ({
      id: result.recipe.id,
      title: result.recipe.title,
      reason: result.reason,
    }));

  return { profile, enabledSkillPackIds, skillPacks, topRecipes };
}
