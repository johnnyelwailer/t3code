import type { T3workActionRecipeContext } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

export function buildT3workActionRecipeLaunchContext(
  renderContext: ProjectRecipeRenderContext,
): T3workActionRecipeContext {
  const launchContext: T3workActionRecipeContext = {
    surface: renderContext.surface,
    project: { ...renderContext.project },
    linkedResources: renderContext.linkedResources.toJSON(),
    artifacts: renderContext.artifacts.toJSON(),
    profile: { ...renderContext.profile },
    schema: { ...renderContext.schema },
    enabledSkillPacks: [...renderContext.enabledSkillPacks],
    availableContextKeys: renderContext.availableContextKeys.toJSON(),
  };

  if (renderContext.workitem) {
    Object.assign(launchContext, { workitem: { ...renderContext.workitem } });
  }
  if (renderContext.contextAttachments) {
    Object.assign(launchContext, {
      contextAttachments: renderContext.contextAttachments.toJSON(),
    });
  }
  if (renderContext.surfaceState) {
    Object.assign(launchContext, {
      surfaceState: {
        ...renderContext.surfaceState,
        ...(renderContext.surfaceState.currentView
          ? { currentView: { ...renderContext.surfaceState.currentView } }
          : {}),
      },
    });
  }

  return launchContext;
}
