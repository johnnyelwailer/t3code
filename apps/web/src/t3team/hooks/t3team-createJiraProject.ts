import * as Effect from "effect/Effect";

import type { ExternalProject } from "@t3tools/integrations-core";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { t3teamCreateProject } from "~/t3team/t3team-mock-adapter";
import { resolveT3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

import { buildInitialRaw, normalizeRepositoryUrls } from "./t3team-createProjectBootstrap";
import { finalizeCreatedProject } from "./t3team-createProjectFinalization";
import { readIntegrationCache } from "./t3team-integrationCache";
import {
  atlassianProjectsCacheKey,
  type JiraCatalogProject,
} from "./t3team-jiraProjectCatalog.logic";

/**
 * The catalog row only carries what a list needs; creating a project also wants the rest of what
 * Jira said about it (`raw`, URL). Read it from the per-site list the catalog was built from, and
 * only go back to Jira when that list no longer has it.
 */
export async function resolveJiraExternalProject(
  backend: BackendApi,
  entry: Pick<JiraCatalogProject, "accountId" | "provider" | "externalProjectId">,
): Promise<ExternalProject> {
  const account = { id: entry.accountId, provider: entry.provider };
  const find = (projects: ReadonlyArray<ExternalProject> | undefined) =>
    projects?.find((project) => project.id === entry.externalProjectId);

  const cached = find(
    readIntegrationCache<ReadonlyArray<ExternalProject>>(atlassianProjectsCacheKey(account))?.value,
  );
  if (cached) return cached;

  const live = find(await backend.atlassian.listProjects(account));
  if (!live) throw new Error("That project is no longer available in Jira.");
  return live;
}

export type CreateJiraProjectInput = {
  readonly backend: BackendApi;
  readonly entry: JiraCatalogProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly setupProfileId: string;
  readonly customProfile?: T3TeamProfile | undefined;
};

/** Creates the project record, then provisions its workspace (repos, setup profile). */
export async function createJiraProject(
  input: CreateJiraProjectInput,
): Promise<ProjectShellProject> {
  const { backend, entry } = input;
  const external = await resolveJiraExternalProject(backend, entry);
  const linkedRepositoryUrls = normalizeRepositoryUrls(input.linkedRepositoryUrls);
  const setupProfileId = resolveT3TeamProjectSetupProfileId(input.setupProfileId);
  const project = await Effect.runPromise(
    t3teamCreateProject({
      title: external.title,
      sourceProvider: external.provider,
      accountId: entry.accountId,
      externalProjectId: external.id,
      ...(external.key ? { externalProjectKey: external.key } : {}),
      ...(external.url ? { externalProjectUrl: external.url } : {}),
      raw: buildInitialRaw(external.raw, linkedRepositoryUrls, setupProfileId),
    }),
  );
  return finalizeCreatedProject({
    backend,
    project,
    linkedRepositoryUrls,
    setupProfileId,
    ...(input.customProfile ? { customProfile: input.customProfile } : {}),
  });
}
