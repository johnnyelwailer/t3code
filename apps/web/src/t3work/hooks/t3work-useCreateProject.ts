import { useCallback, useState } from "react";
import * as Effect from "effect/Effect";
import { DEFAULT_MODEL, ProviderInstanceId } from "@t3tools/contracts";
import type {
  AtlassianAccessibleResource,
  TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useBackend } from "~/t3work/backend/t3work-index";
import { t3workCreateProject } from "~/t3work/t3work-mock-adapter";
import {
  applyWorkspaceBootstrapToProject,
  buildInitialRaw,
  normalizeRepositoryUrls,
} from "./t3work-createProjectBootstrap";
import {
  isValidAtlassianUrl,
  normalizeAtlassianUrl,
  persistLastAccountId,
} from "./t3work-createProjectUtils";
import { applyLoadedAccounts, failWithStep } from "./t3work-useCreateProjectHelpers";
import { loadPersistedAccountsStep } from "./t3work-useCreateProjectLoadPersisted";

export type CreateProjectStep = "source" | "account" | "project" | "confirm" | "creating";
export type AtlassianBasicCredentials = { siteUrl: string; email: string; apiToken: string };
type CreateProjectOptions = { readonly linkedRepositoryUrls?: ReadonlyArray<string> };

export function useCreateProject() {
  const backend = useBackend();
  const [step, setStep] = useState<CreateProjectStep>("source");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [accounts, setAccounts] = useState<ReadonlyArray<IntegrationAccount>>([]);
  const [selectedAccount, setSelectedAccount] = useState<IntegrationAccount | null>(null);
  const [projects, setProjects] = useState<ReadonlyArray<ExternalProject>>([]);
  const [selectedProject, setSelectedProject] = useState<ExternalProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const fail = useCallback(
    (value: unknown, fallback: string, nextStep: CreateProjectStep = "source") =>
      failWithStep(setError, setStep, value, fallback, nextStep),
    [],
  );

  const applyAccounts = useCallback(
    (loadedAccounts: ReadonlyArray<IntegrationAccount>) =>
      applyLoadedAccounts({
        loadedAccounts,
        setAccounts,
        setSelectedProject,
        setError,
        setStep,
        setSelectedAccount,
      }),
    [],
  );

  const loadPersistedAccounts = useCallback(async () => {
    await loadPersistedAccountsStep({
      backend,
      setAccounts,
      setSelectedAccount,
      setSelectedProject,
      setProjects,
      setStep,
      setBootstrapping,
      setLoadingAccounts,
      setLoadingProjects,
      setError,
      fail,
    });
  }, [backend, fail]);

  const loadAccountsWithOAuth = useCallback(
    async (sites: ReadonlyArray<AtlassianAccessibleResource>, token: TokenExchangeResult) => {
      setError(null);
      setLoadingAccounts(true);
      try {
        if (!backend) throw new Error("Backend not available");
        applyAccounts(await backend.atlassian.connectOAuth({ sites, token }));
      } catch (e) {
        fail(e, "Failed to connect Atlassian");
      } finally {
        setLoadingAccounts(false);
      }
    },
    [applyAccounts, backend, fail],
  );

  const loadAccountsWithBasic = useCallback(
    async (credentials: AtlassianBasicCredentials) => {
      setError(null);
      setLoadingAccounts(true);
      try {
        if (!backend) throw new Error("Backend not available");
        applyAccounts(
          await backend.atlassian.connectBasic({
            ...credentials,
            siteUrl: normalizeAtlassianUrl(credentials.siteUrl),
          }),
        );
      } catch (e) {
        fail(e, "Failed to connect Atlassian");
      } finally {
        setLoadingAccounts(false);
      }
    },
    [applyAccounts, backend, fail],
  );

  const loadProjects = useCallback(
    async (account: IntegrationAccount) => {
      setError(null);
      setLoadingProjects(true);
      try {
        if (!backend) throw new Error("Backend not available");
        setSelectedAccount(account);
        persistLastAccountId(account.id);
        setSelectedProject(null);
        setProjects(
          await backend.atlassian.listProjects({ id: account.id, provider: account.provider }),
        );
        setStep("project");
      } catch (e) {
        fail(e, "Failed to load Jira projects", "account");
      } finally {
        setLoadingProjects(false);
      }
    },
    [backend, fail],
  );

  const createProject = useCallback(
    async (
      externalProject: ExternalProject,
      options?: CreateProjectOptions,
    ): Promise<ProjectShellProject> => {
      setStep("creating");
      setError(null);
      try {
        if (!backend) throw new Error("Backend not available");
        if (!selectedAccount)
          throw new Error("Select an Atlassian site before creating a project.");
        const linkedRepositoryUrls = normalizeRepositoryUrls(options?.linkedRepositoryUrls);
        const project = await Effect.runPromise(
          t3workCreateProject({
            title: externalProject.title,
            sourceProvider: externalProject.provider,
            accountId: selectedAccount.id,
            externalProjectId: externalProject.id,
            ...(externalProject.key ? { externalProjectKey: externalProject.key } : {}),
            ...(externalProject.url ? { externalProjectUrl: externalProject.url } : {}),
            raw: buildInitialRaw(externalProject.raw, linkedRepositoryUrls),
          }),
        );
        if (!project.workspace?.rootPath)
          throw new Error("Created project is missing a managed workspace root.");
        await backend.dispatchCommand({
          type: "project.create",
          commandId: crypto.randomUUID() as any,
          projectId: project.id as any,
          title: project.title,
          workspaceRoot: project.workspace.rootPath,
          createWorkspaceRootIfMissing: true,
          defaultModelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: DEFAULT_MODEL,
          },
          createdAt: new Date().toISOString(),
        });
        try {
          const bootstrap = await backend.projectWorkspace.bootstrapWorkspace({
            workspaceRoot: project.workspace.rootPath,
            linkedRepositoryUrls,
          });
          return applyWorkspaceBootstrapToProject(project, bootstrap);
        } catch {
          return project;
        }
      } catch (e) {
        fail(e, "Failed to create project", "project");
        throw e;
      }
    },
    [backend, fail, selectedAccount],
  );

  return {
    step,
    accounts,
    selectedAccount,
    projects,
    selectedProject,
    error,
    bootstrapping,
    loadingAccounts,
    loadingProjects,
    setStep,
    setSelectedAccount,
    setSelectedProject,
    loadAccountsWithOAuth,
    loadAccountsWithBasic,
    loadPersistedAccounts,
    loadProjects,
    createProject,
    isValidUrl: isValidAtlassianUrl,
  };
}
