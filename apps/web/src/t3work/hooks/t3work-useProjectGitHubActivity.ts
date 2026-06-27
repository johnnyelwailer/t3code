import { useEffect, useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { asT3workPollingBackend } from "~/t3work/backend/t3work-pollingBackend";
import { useBackend } from "~/t3work/backend/t3work-index";
import {
  groupGitHubActivityByWorkItem,
  toGitHubWorkActivityItems,
  type GitHubWorkActivityItem,
} from "~/t3work/t3work-githubActivity";
import {
  areGitHubActivityItemsEqual,
  type ProjectGitHubActivityCache,
} from "./t3work-projectGitHubActivityShared";
import {
  normalizeCacheList,
  readIntegrationCache,
  writeIntegrationCache,
} from "./t3work-integrationCache";
import {
  GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
  GITHUB_ACTIVITY_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "./t3work-integrationPolling";
import { resolveProjectGitHubActivityDiscovery } from "./t3work-useProjectGitHubActivityDiscovery";

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
  const backend = asT3workPollingBackend(useBackend());
  const environmentId = usePrimaryEnvironmentId();
  const discoverSourceControl = useAtomQueryRunner(sourceControlEnvironment.discovery, {
    reportFailure: false,
  });
  const cacheKey = useMemo(
    () =>
      `github:projectActivity:${project.id}:${project.source.externalProjectKey ?? "none"}:${project.title}:${normalizeCacheList(linkedRepositoryUrls)}`,
    [linkedRepositoryUrls, project.id, project.source.externalProjectKey, project.title],
  );
  const cached = readIntegrationCache<ProjectGitHubActivityCache>(cacheKey)?.value;
  const cachedRecord = readIntegrationCache<ProjectGitHubActivityCache>(cacheKey);
  const [loading, setLoading] = useState(false);
  const [host, setHost] = useState<string>(cached?.host ?? "github.com");
  const [account, setAccount] = useState<string | undefined>(cached?.account);
  const [warning, setWarning] = useState<string | undefined>(cached?.warning);
  const [suggestedRepositoryCount, setSuggestedRepositoryCount] = useState(
    cached?.suggestedRepositoryCount ?? 0,
  );
  const [activityItems, setActivityItems] = useState<ReadonlyArray<GitHubWorkActivityItem>>(
    cached?.activityItems ?? [],
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>(cachedRecord?.updatedAt);

  useEffect(() => {
    const nextCachedRecord = readIntegrationCache<ProjectGitHubActivityCache>(cacheKey);
    const cachedValue = nextCachedRecord?.value;
    setHost(cachedValue?.host ?? "github.com");
    setAccount(cachedValue?.account);
    setWarning(cachedValue?.warning);
    setSuggestedRepositoryCount(cachedValue?.suggestedRepositoryCount ?? 0);
    setActivityItems(cachedValue?.activityItems ?? []);
    setLastCheckedAt(nextCachedRecord?.updatedAt);
  }, [cacheKey]);

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
      const cachedRecord = readIntegrationCache<ProjectGitHubActivityCache>(cacheKey);
      setLoading(cachedRecord?.value == null);
      try {
        // Prefer cached metadata and avoid rediscovering source control on every poll cycle.
        let resolvedHost = cachedRecord?.value.host ?? host;
        let discoveredAccount = cachedRecord?.value.account ?? account;
        const discovery = await resolveProjectGitHubActivityDiscovery({
          environmentId,
          discoverSourceControl,
          host: resolvedHost,
          account: discoveredAccount,
        });
        resolvedHost = discovery.host;
        discoveredAccount = discovery.account;

        const response = await backend.github.pollInbox({
          host: resolvedHost,
          ...(project.source.externalProjectKey
            ? { projectKey: project.source.externalProjectKey }
            : {}),
          ...(project.title ? { projectTitle: project.title } : {}),
          linkedRepositoryUrls,
          ...(cachedRecord?.fingerprint ? { knownFingerprint: cachedRecord.fingerprint } : {}),
        });

        if (cancelled) return;
        const nextCache = response.unchanged
          ? {
              host: cachedRecord?.value.host ?? resolvedHost,
              ...((cachedRecord?.value.account ?? discoveredAccount)
                ? { account: cachedRecord?.value.account ?? discoveredAccount }
                : {}),
              ...(cachedRecord?.value.warning ? { warning: cachedRecord.value.warning } : {}),
              suggestedRepositoryCount: cachedRecord?.value.suggestedRepositoryCount ?? 0,
              activityItems: cachedRecord?.value.activityItems ?? [],
            }
          : {
              host: response.value.host || resolvedHost,
              ...((response.value.account ?? discoveredAccount)
                ? { account: response.value.account ?? discoveredAccount }
                : {}),
              ...(response.value.inboxWarning ? { warning: response.value.inboxWarning } : {}),
              suggestedRepositoryCount: response.value.suggestedRepositoryUrls.length,
              activityItems: toGitHubWorkActivityItems(response.value.inboxItems),
            };
        const nextCheckedAt = Date.now();
        writeIntegrationCache(cacheKey, nextCache, {
          fingerprint: response.fingerprint,
          updatedAt: nextCheckedAt,
        });
        setHost((current) => (current === nextCache.host ? current : nextCache.host));
        setAccount((current) => (current === nextCache.account ? current : nextCache.account));
        setWarning((current) => (current === nextCache.warning ? current : nextCache.warning));
        setSuggestedRepositoryCount((current) =>
          current === nextCache.suggestedRepositoryCount
            ? current
            : nextCache.suggestedRepositoryCount,
        );
        setActivityItems((current) =>
          areGitHubActivityItemsEqual(current, nextCache.activityItems)
            ? current
            : nextCache.activityItems,
        );

        // Keep polling cadence fresh via cache timestamp, but avoid minute-level UI churn when data is unchanged.
        if (!response.unchanged || cachedRecord?.updatedAt === undefined) {
          setLastCheckedAt(nextCheckedAt);
        }
      } catch (error) {
        if (cancelled) return;
        setWarning(error instanceof Error ? error.message : "Unable to load GitHub activity");
        setActivityItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const poller = startBrowserPolling({
      enabled,
      intervalMs: GITHUB_ACTIVITY_POLL_INTERVAL_MS,
      maxAgeMs: GITHUB_ACTIVITY_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => readIntegrationCache<ProjectGitHubActivityCache>(cacheKey)?.updatedAt,
      poll: load,
    });

    return () => {
      cancelled = true;
      poller.dispose();
    };
  }, [
    backend,
    cacheKey,
    enabled,
    linkedRepositoryUrls,
    project.source.externalProjectKey,
    project.title,
    account,
    discoverSourceControl,
    environmentId,
    host,
  ]);

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
    lastCheckedAt,
  };
}
