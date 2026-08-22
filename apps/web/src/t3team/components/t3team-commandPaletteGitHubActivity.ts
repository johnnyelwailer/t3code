import type { ProjectShellProject } from "@t3tools/project-context";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { useBackend } from "~/t3team/backend/t3team-index";
import { readLinkedRepositoryUrlsFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  normalizeCacheList,
  readIntegrationCache,
  writeIntegrationCache,
} from "~/t3team/hooks/t3team-integrationCache";
import {
  parseGitHubHostFromDiscovery,
  toGitHubWorkActivityItems,
} from "~/t3team/t3team-githubActivity";

export type ProjectGitHubActivitySearchItem = {
  projectId: string;
  projectTitle: string;
  id: string;
  repository: string;
  reason: string;
  subjectTitle?: string;
  subjectUrl?: string;
  workItemKey?: string;
};

type CommandPaletteGitHubCache = {
  readonly host: string;
  readonly items: ReadonlyArray<ProjectGitHubActivitySearchItem>;
};

/** Cached-first GitHub inbox activity for every bound project, refreshed while the palette is open. */
export function useCommandPaletteGitHubActivity(
  open: boolean,
  projects: ReadonlyArray<ProjectShellProject>,
): ReadonlyArray<ProjectGitHubActivitySearchItem> {
  const backend = useBackend();
  const environmentId = usePrimaryEnvironmentId();
  const discoverSourceControl = useAtomQueryRunner(sourceControlEnvironment.discovery, {
    reportFailure: false,
  });
  const [githubActivityItems, setGitHubActivityItems] = useState<
    ReadonlyArray<ProjectGitHubActivitySearchItem>
  >([]);

  useEffect(() => {
    if (!open || !backend) {
      setGitHubActivityItems([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const cacheKey = `github:commandPalette:${projects
        .map((project) =>
          [
            project.id,
            project.source.externalProjectKey ?? "none",
            project.title,
            normalizeCacheList(readLinkedRepositoryUrlsFromProject(project)),
          ].join(":"),
        )
        .toSorted((a, b) => a.localeCompare(b))
        .join(";")}`;
      const cached = readIntegrationCache<CommandPaletteGitHubCache>(cacheKey)?.value;
      if (cached?.items && cached.items.length > 0) {
        setGitHubActivityItems(cached.items);
      }

      let host = cached?.host ?? "github.com";
      if (environmentId !== null) {
        const discoveryResult = await discoverSourceControl({
          environmentId,
          input: {},
        });
        host = AsyncResult.isSuccess(discoveryResult)
          ? parseGitHubHostFromDiscovery(discoveryResult.value)
          : "github.com";
      }

      const results = await Promise.all(
        projects.map(async (project) => {
          const linkedRepositoryUrls = readLinkedRepositoryUrlsFromProject(project);
          try {
            const response = await backend.github.discoverInbox({
              host,
              ...(project.source.externalProjectKey
                ? { projectKey: project.source.externalProjectKey }
                : {}),
              ...(project.title ? { projectTitle: project.title } : {}),
              linkedRepositoryUrls,
            });
            return toGitHubWorkActivityItems(response.inboxItems).map((item) => {
              const searchItem: ProjectGitHubActivitySearchItem = {
                projectId: project.id,
                projectTitle: project.title,
                id: item.id,
                repository: item.repository,
                reason: item.reason,
              };
              if (item.subjectTitle) {
                searchItem.subjectTitle = item.subjectTitle;
              }
              if (item.subjectUrl) {
                searchItem.subjectUrl = item.subjectUrl;
              }
              if (item.workItemKey) {
                searchItem.workItemKey = item.workItemKey;
              }
              return searchItem;
            });
          } catch {
            return [];
          }
        }),
      );

      if (cancelled) return;
      const nextItems = results.flat();
      writeIntegrationCache(cacheKey, { host, items: nextItems });
      setGitHubActivityItems(nextItems);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [backend, discoverSourceControl, environmentId, open, projects]);

  return githubActivityItems;
}
