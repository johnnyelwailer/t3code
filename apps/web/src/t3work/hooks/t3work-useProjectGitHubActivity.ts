import { useEffect, useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { readLocalApi } from "~/localApi";
import { useBackend } from "~/t3work/backend/t3work-index";
import {
  groupGitHubActivityByWorkItem,
  parseGitHubHostFromDiscovery,
  parseOptionString,
  toGitHubWorkActivityItems,
  type GitHubWorkActivityItem,
} from "~/t3work/t3work-githubActivity";

type UseProjectGitHubActivityOptions = {
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly enabled?: boolean;
};

export function useProjectGitHubActivity({
  project,
  linkedRepositoryUrls,
  enabled = true,
}: UseProjectGitHubActivityOptions) {
  const backend = useBackend();
  const [loading, setLoading] = useState(false);
  const [host, setHost] = useState<string>("github.com");
  const [account, setAccount] = useState<string | undefined>(undefined);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [suggestedRepositoryCount, setSuggestedRepositoryCount] = useState(0);
  const [activityItems, setActivityItems] = useState<ReadonlyArray<GitHubWorkActivityItem>>([]);

  useEffect(() => {
    if (!backend) return;
    if (!enabled) {
      setLoading(false);
      setAccount(undefined);
      setWarning(undefined);
      setSuggestedRepositoryCount(0);
      setActivityItems([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        let resolvedHost = "github.com";
        let discoveredAccount: string | undefined;
        const localApi = readLocalApi();
        if (localApi) {
          const discovery = await localApi.server.discoverSourceControl();
          resolvedHost = parseGitHubHostFromDiscovery(discovery);
          const githubProvider = discovery.sourceControlProviders.find(
            (provider) => provider.kind === "github",
          );
          discoveredAccount = githubProvider
            ? parseOptionString(githubProvider.auth.account)
            : undefined;
        }

        const response = await backend.github.discoverInbox({
          host: resolvedHost,
          ...(project.source.externalProjectKey
            ? { projectKey: project.source.externalProjectKey }
            : {}),
          ...(project.title ? { projectTitle: project.title } : {}),
          linkedRepositoryUrls,
        });

        if (cancelled) return;
        setHost(response.host || resolvedHost);
        setAccount(response.account ?? discoveredAccount);
        setWarning(response.inboxWarning);
        setSuggestedRepositoryCount(response.suggestedRepositoryUrls.length);
        setActivityItems(toGitHubWorkActivityItems(response.inboxItems));
      } catch (error) {
        if (cancelled) return;
        setWarning(error instanceof Error ? error.message : "Unable to load GitHub activity");
        setActivityItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [backend, enabled, linkedRepositoryUrls, project.source.externalProjectKey, project.title]);

  const activityByWorkItem = useMemo(
    () => groupGitHubActivityByWorkItem(activityItems),
    [activityItems],
  );

  const unlinkedActivityItems = useMemo(
    () => activityItems.filter((item) => !item.workItemKey),
    [activityItems],
  );

  return {
    loading,
    host,
    account,
    warning,
    suggestedRepositoryCount,
    activityItems,
    activityByWorkItem,
    unlinkedActivityItems,
  };
}
