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
import {
  createDigestPendingRetry,
  digestScopeSignature,
  readInitialDigestState,
  writeCachedDigestGraph,
} from "./t3team-digestGraphCache";
import { toDigestProjectEntries } from "./t3team-digestProjectEntries";

export type {
  UseMyWorkDigestGraphInput,
  UseMyWorkDigestGraphResult,
} from "./t3team-useMyWorkDigestGraphTypes";
import type {
  UseMyWorkDigestGraphInput,
  UseMyWorkDigestGraphResult,
} from "./t3team-useMyWorkDigestGraphTypes";

/** No visit receipt yet: everything counts as new since the last visit. */
const LAST_VISIT_EPOCH = "1970-01-01T00:00:00.000Z";

export function useMyWorkDigestGraph(input: UseMyWorkDigestGraphInput): UseMyWorkDigestGraphResult {
  const backend = useBackend();
  const projects = input.projects;
  const scope = input.scope ?? "project";
  const enabled = input.enabled ?? true;

  const entries = useMemo(() => toDigestProjectEntries(projects), [projects]);
  const resetSignature = digestScopeSignature(scope, entries);
  // The last graph for this scope paints at once; the poller revalidates it underneath.
  const [initial] = useState(() => readInitialDigestState(resetSignature));
  const [graph, setGraph] = useState(initial.graph);
  const [status, setStatus] = useState<"loading" | "ready" | "retrying" | "error">(initial.status);
  const [error, setError] = useState<string | undefined>(undefined);
  const [viewerUnresolved, setViewerUnresolved] = useState(initial.viewerUnresolved);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pendingRetry] = useState(createDigestPendingRetry);
  const fingerprintRef = useRef<string | undefined>(undefined);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  // Bumped when the scope signature changes so an in-flight load from the
  // previous scope cannot clobber the new one (same guard as useProjectMyWork).
  const generationRef = useRef(0);

  // Scope changed since the last render: reset in place (React's "adjust state
  // on prop change" pattern) instead of an effect, so no other scope's graph paints first.
  const [renderedSignature, setRenderedSignature] = useState(resetSignature);
  if (renderedSignature !== resetSignature) {
    const cached = readInitialDigestState(resetSignature);
    setRenderedSignature(resetSignature);
    setGraph(cached.graph);
    setStatus(cached.status);
    setError(undefined);
    setViewerUnresolved(cached.viewerUnresolved);
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
      input.viewer?.name?.trim() || readCachedAtlassianCurrentUserDisplayName(firstAccount) || "";

    try {
      const result = await pollFn({
        scope,
        projects: entries,
        // The server's burndown join needs the Jira display name the mirror
        // assigns to; the cached name is the same one the chip wears.
        viewer: { name: viewerDisplayName() },
        // "Yesterday" is the viewer's previous working day, in the viewer's zone.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(fingerprintRef.current !== undefined
          ? { knownFingerprint: fingerprintRef.current }
          : {}),
      });
      if (generationRef.current !== gen) return;

      if (result.unchanged) {
        fingerprintRef.current = result.fingerprint;
        pendingRetry.update(undefined, () => void loadRef.current(scope, entries));
        return;
      }

      fingerprintRef.current = result.fingerprint;
      const viewer: DigestViewer = {
        // The server resolves the viewer from the mirror (the exact string `ticket.assignee`
        // carries), so it is authoritative for the `isMine` join; the client's cached name is
        // only a fallback for a payload that could not resolve one.
        name: result.value.viewer?.name || viewerDisplayName() || "",
        role: input.viewer?.role?.trim() || "",
        // The server's visit receipt: the previous changed round is the cutoff.
        lastVisitAt: result.value.viewer?.lastVisitAt ?? LAST_VISIT_EPOCH,
      };

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
      const unresolved = result.value.viewer?.unresolved === true;
      writeCachedDigestGraph(digestScopeSignature(scope, entries), nextGraph, unresolved);
      // Change requests still being read server-side: pick them up in a moment, not a poll later.
      const crPending = result.value.changeRequestsPending === true;
      pendingRetry.update(crPending, () => void loadRef.current(scope, entries));
      setViewerUnresolved(unresolved);
      setSessionExpired(false);
      setGraph(nextGraph);
      setStatus("ready");
      setError(undefined);
      lastCheckedAtRef.current = Date.now();
    } catch (cause) {
      if (generationRef.current !== gen) return;
      // A dead refresh token is terminal: the server cleared the credentials, only sign-in recovers.
      if (isJiraSessionExpiredError(cause)) {
        setSessionExpired(true);
        setError(undefined);
        setStatus("error");
        return;
      }
      // A failed fetch (backend booting, timeout, network) is transient: the poller retries.
      setStatus("retrying");
      setError(undefined);
    }
  };

  // The poller reads the latest loader through a ref (fresh backend/viewer on
  // every tick) while its subscription restarts only when scope or entries change.
  const loadRef = useRef(load);
  const entriesRef = useRef(entries);
  useEffect(() => {
    loadRef.current = load;
    entriesRef.current = entries;
  });

  // Keyed on the scope SIGNATURE, not the `entries` array: the project store rebuilds its project
  // objects on every live snapshot, and restarting the poller on each of those bumped the
  // generation and dropped the in-flight answer — at startup, often every answer, so the digest
  // sat empty until a remount.
  useEffect(() => {
    const entries = entriesRef.current;
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
      // Same signature, but names can change underneath: send the latest entries each tick.
      poll: () => loadRef.current(scope, entriesRef.current),
    });
    return () => {
      poller.dispose();
      pendingRetry.dispose();
      // Unmount or scope change: results still in flight must not land.
      generationRef.current += 1;
    };
  }, [enabled, resetSignature, scope]);

  // Nothing to load for an empty scope: report "ready" without touching state.
  const idle = enabled && entries.length === 0;

  return {
    graph: idle ? null : graph,
    status: idle ? "ready" : status,
    ...(error !== undefined && !idle ? { error } : {}),
    viewerUnresolved,
    sessionExpired: idle ? false : sessionExpired,
    ...(lastCheckedAtRef.current !== undefined && !idle
      ? { updatedAt: lastCheckedAtRef.current }
      : {}),
    reload: () => {
      void loadRef.current(scope, entries);
    },
  };
}
