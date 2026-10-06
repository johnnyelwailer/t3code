import type { ProjectShellProject } from "@t3tools/project-context";
import { getT3TeamProfile } from "@t3tools/t3team-skill-packs";

import { buildT3TeamActionRecipeLaunchContext } from "~/t3team/t3team-actionRecipeLaunchContext";
import type { DigestRecipeScope } from "~/t3team/t3team-digestRecipeAction";
import { digestPrUrl } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { T3TeamRecipeQuickStartLaunchCustomization } from "~/t3team/t3team-recipeQuickStartLaunch";
import { buildRecipeRenderContext } from "~/t3team/t3team-sidecarRecipeRenderContext";
import type {
  T3TeamSidecarRecipeInput,
  T3TeamSidecarRecipeLinkedResource,
  T3TeamSidecarRecipeQuickStart,
} from "~/t3team/t3team-sidecarRecipeTypes";

/** The surface the digest's PR recipes are authored for (`surfaces` in each pack recipe). */
export const DIGEST_CHANGE_REQUEST_RECIPE_SURFACE = "github.pull_request.detail.sidepanel";

/**
 * The recipe input the digest resolves its PR recipe catalog with. It names no PR: catalog
 * membership is per surface, and every row's PR is attached only when its pill is clicked.
 */
export function buildDigestRecipeCatalogInput(input: {
  readonly project: ProjectShellProject;
  readonly profileId: string | undefined;
}): T3TeamSidecarRecipeInput {
  return {
    surface: DIGEST_CHANGE_REQUEST_RECIPE_SURFACE,
    project: input.project,
    profileId: input.profileId,
    selectedWorkLabel: input.project.title,
    availableContextKeys: ["project.summary"],
    // A lookup table, not a quick-start list: keep every recipe the surface offers.
    limit: 50,
  };
}

function changeRequestLabel(scope: DigestRecipeScope): string {
  return `${scope.changeRequest.repo}#${scope.changeRequest.number}`;
}

/** The PR as the linked resource the PR-detail surface promises its recipes (Epic 16 context map). */
export function buildDigestChangeRequestResource(
  scope: DigestRecipeScope,
): T3TeamSidecarRecipeLinkedResource {
  const { changeRequest } = scope;
  return {
    kind: "github.pull-request",
    id: `${changeRequest.host ?? ""}:${changeRequestLabel(scope)}`,
    provider: "github",
    label: changeRequestLabel(scope),
    ...(changeRequest.title ? { title: changeRequest.title } : {}),
    url: digestPrUrl(changeRequest),
    raw: {
      repository: changeRequest.repo,
      number: changeRequest.number,
      ...(changeRequest.host ? { host: changeRequest.host } : {}),
      active: true,
    },
  };
}

/**
 * The launch selections that pin a staged recipe to its PR. They show on the composer's
 * "Selected action" chip, land on `workflow.parameters`, and name the PR in the kickoff prompt;
 * they also make two PRs' stagings of one recipe distinct, so the second click replaces the first.
 */
export function buildDigestRecipeLaunchCustomization(
  scope: DigestRecipeScope,
): T3TeamRecipeQuickStartLaunchCustomization {
  const url = digestPrUrl(scope.changeRequest);
  const title = scope.changeRequest.title;
  const workItem = scope.workItem;
  return {
    selections: [
      {
        name: "pullRequest",
        label: "Pull request",
        value: url,
        displayValue: changeRequestLabel(scope),
        promptText: `Pull request: ${changeRequestLabel(scope)}${title ? ` "${title}"` : ""} (${url})`,
      },
      ...(workItem
        ? [
            {
              name: "workItem",
              label: "Ticket",
              value: workItem.key,
              promptText: `Ticket: ${workItem.key}${workItem.title ? ` "${workItem.title}"` : ""}`,
            },
          ]
        : []),
    ],
  };
}

/**
 * The catalog recipe re-targeted at one PR: its launch context is rebuilt from the same render
 * context builder discovery used, with the PR as the active linked resource and its ticket as the
 * work item. A recipe without a workflow carries no launch context and is returned as is.
 */
export function scopeDigestRecipeQuickStart(input: {
  readonly quickStart: T3TeamSidecarRecipeQuickStart;
  readonly catalogInput: T3TeamSidecarRecipeInput;
  readonly scope: DigestRecipeScope;
}): T3TeamSidecarRecipeQuickStart {
  const { quickStart, catalogInput, scope } = input;
  if (!quickStart.workflow) return quickStart;
  const scopedInput: T3TeamSidecarRecipeInput = {
    ...catalogInput,
    linkedResources: [
      ...(catalogInput.linkedResources ?? []),
      buildDigestChangeRequestResource(scope),
    ],
    ...(scope.workItem
      ? {
          resourceKind: "ticket",
          selectedWorkLabel: scope.workItem.key,
          ...(scope.workItem.title ? { selectedWorkTitle: scope.workItem.title } : {}),
        }
      : {}),
  };
  const renderContext = buildRecipeRenderContext(
    scopedInput,
    getT3TeamProfile(catalogInput.profileId),
    catalogInput.project.workspace?.rootPath,
  );
  return {
    ...quickStart,
    workflow: {
      ...quickStart.workflow,
      launchContext: buildT3TeamActionRecipeLaunchContext(renderContext),
    },
  };
}
