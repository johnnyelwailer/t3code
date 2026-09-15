/**
 * The real data source behind the My Work Digest views.
 *
 * One POST per round to `/api/t3team/mywork-digest/graph/poll` aggregates the
 * whole digest server-side (tickets from the Jira mirror, claims from the
 * thread projections, pending decisions from the workflow run record, change
 * requests from the cached PR listing, transitions from the mirror's status
 * capture). The fingerprint envelope short-circuits unchanged rounds, and
 * `startBrowserPolling` drives refreshes with visibility/online gating — the
 * same machinery My Work already uses.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  readMyWorkDigestPollFn,
  type MyWorkDigestProjectInput,
  type MyWorkDigestScope,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { isJiraSessionExpiredError } from "~/t3team/backend/t3team-t3BackendHttp";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "~/t3team/hooks/t3team-integrationPolling";
import { readCachedAtlassianCurrentUserDisplayName } from "~/t3team/hooks/t3team-useAtlassianCurrentUserDisplayName";
import { payloadToDigestGraph, type DigestViewer } from "./t3team-digestGraphMappers";
import { readLastVisitAt, writeLastVisitAt } from "./t3team-digestLastVisit";
import { toDigestProjectEntries } from "./t3team-digestProjectEntries";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type {
  UseMyWorkDigestGraphInput,
  UseMyWorkDigestGraphResult,
} from "./t3team-useMyWorkDigestGraphTypes";
import type {
  UseMyWorkDigestGraphInput,
  UseMyWorkDigestGraphResult,
} from "./t3team-useMyWorkDigestGraphTypes";

export function useMyWorkDigestGraph(input: UseMyWorkDigestGraphInput): UseMyWorkDigestGraphResult {
  const backend = useBackend();
  const [graph, setGraph] = useState<DigestGraph | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | undefined>(undefined);
  const [viewerUnresolved, setViewerUnresolved] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const projects = input.projects;
  const scope = input.scope ?? "project";
  const enabled = input.enabled ?? true;

  const entries = useMemo(() => toDigestProjectEntries(projects), [projects]);

  const scopeKey = entries
    .map((entry) => `${entry.account.id}:${entry.externalProjectId}`)
    .join("|");
  const fingerprintRef = useRef<string | undefined>(undefined);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  // Bumped when the scope signature changes so an in-flight load from the
  // previous scope cannot clobber the new one (same guard as useProjectMyWork).
  const generationRef = useRef(0);

  // Scope changed since the last render: reset in place (React's "adjust state
  // on prop change" pattern) instead of an effect, so no stale graph paints first.
  const resetSignature = `${scope}|${scopeKey}`;
  const [renderedSignature, setRenderedSignature] = useState(resetSignature);
  if (renderedSignature !== resetSignature) {
    setRenderedSignature(resetSignature);
    setGraph(null);
    setStatus("loading");
    setError(undefined);
    setViewerUnresolved(false);
    setSessionExpired(false);
  }

  const load = async (
    scope: MyWorkDigestScope,
    entries: ReadonlyArray<MyWorkDigestProjectInput>,
  ) => {
    const gen = generationRef.current;
    if (!enabled || entries.length === 0) return;
    const pollFn = readMyWorkDigestPollFn(backend);
    if (pollFn === undefined) {
      if (generationRef.current !== gen) return;
      setError("This server does not support the My Work digest yet.");
      setStatus("error");
      return;
    }

    const firstAccount = entries[0]?.account.id;
    const viewerDisplayName = () =>
      input.viewer?.name?.trim() !== ""
        ? (input.viewer?.name as string)
        : (readCachedAtlassianCurrentUserDisplayName(firstAccount) ?? "");

    try {
      const result = await pollFn({
        scope,
        projects: entries,
        // The server's burndown join needs the Jira display name the mirror
        // assigns to; the cached name is the same one the chip wears.
        viewer: { name: viewerDisplayName() },
        ...(fingerprintRef.current !== undefined
          ? { knownFingerprint: fingerprintRef.current }
          : {}),
      });
      if (generationRef.current !== gen) return;

      if (result.unchanged) {
        fingerprintRef.current = result.fingerprint;
        return;
      }

      fingerprintRef.current = result.fingerprint;
      const viewer: DigestViewer = {
        name: viewerDisplayName() || result.value.viewer?.name || "",
        role: input.viewer?.role?.trim() !== "" ? (input.viewer?.role as string) : "",
        lastVisitAt: readLastVisitAt(scope),
      };
      // Seeing it now counts as "being here": stamp the visit after the
      // request already captured the previous one.
      writeLastVisitAt(scope, new Date().toISOString());

      const nextGraph = payloadToDigestGraph({
        payload: result.value,
        projects: projects.filter((project) =>
          entries.some(
            (entry) =>
              entry.account.id === project.source?.accountId &&
              entry.externalProjectId === project.source?.externalProjectId,
          ),
        ),
        entries,
        viewer,
      });
      setViewerUnresolved(result.value.viewer?.unresolved === true);
      setSessionExpired(false);
      setGraph(nextGraph);
      setStatus("ready");
      setError(undefined);
      lastCheckedAtRef.current = Date.now();
    } catch (cause) {
      if (generationRef.current !== gen) return;
      // A dead refresh token is not a load failure to retry: the server cleared the credentials,
      // so the only way forward is a fresh sign-in.
      if (isJiraSessionExpiredError(cause)) {
        setSessionExpired(true);
        setError(undefined);
        setStatus("error");
        return;
      }
      setError(cause instanceof Error ? cause.message : "Failed to load the My Work digest.");
      setStatus("error");
    }
  };

  // The poller reads the latest loader through a ref (fresh backend/viewer on
  // every tick) while its subscription restarts only when scope or entries change.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled || entries.length === 0) return;
    // A new scope: no fingerprint, no freshness, and any in-flight result from
    // the previous scope is dropped by the generation bump.
    generationRef.current += 1;
    fingerprintRef.current = undefined;
    lastCheckedAtRef.current = undefined;
    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
      maxAgeMs: ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => lastCheckedAtRef.current,
      poll: () => loadRef.current(scope, entries),
    });
    return () => {
      poller.dispose();
      // Unmount or scope change: results still in flight must not land.
      generationRef.current += 1;
    };
  }, [enabled, entries, scope]);

  // Nothing to load for an empty scope: report "ready" without touching state.
  const idle = enabled && entries.length === 0;

  return {
    graph: idle ? null : graph,
    status: idle ? "ready" : status,
    ...(error !== undefined && !idle ? { error } : {}),
    viewerUnresolved,
    sessionExpired: idle ? false : sessionExpired,
    reload: () => {
      void loadRef.current(scope, entries);
    },
  };
}
