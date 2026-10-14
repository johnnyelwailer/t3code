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
 *
 * A paint is not an answer: `freshness` separates "this is the cached graph for the scope" from
 * "the server has answered for the scope in this session", which is what the views gate their
 * empty state on.
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
  writeCachedDigestGraph,
} from "./t3team-digestGraphCache";
import { useMyWorkDigestGraphState } from "./t3team-useMyWorkDigestGraphState";
import { toDigestProjectEntries } from "./t3team-digestProjectEntries";
import {
  mergeProgressiveParts,
  orderProgressiveEntries,
  runProgressiveAllRounds,
  type ProgressiveDigestPart,
} from "./t3team-digestProgressiveAll";

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
  const { state, patch } = useMyWorkDigestGraphState(resetSignature);
  const [pendingRetry] = useState(createDigestPendingRetry);
  const fingerprintRef = useRef<string | undefined>(undefined);
  // The name the last round asked for: the Atlassian accounts cache often fills AFTER the first
  // poll, and a fingerprint minted under the old name would let the server answer `unchanged` for
  // a question we are no longer asking. Drop it when the name moves.
  const requestedViewerRef = useRef<string | undefined>(undefined);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  // Bumped when the scope signature changes so an in-flight load from the
  // previous scope cannot clobber the new one (same guard as useProjectMyWork).
  const generationRef = useRef(0);
  // Progressive All projects paint (t3team-digestProgressiveAll): set once an all-scope round has
  // answered for this scope, after which per-project partials must never land over it.
  const allRoundLandedRef = useRef(false);
  // True while the graph on screen was assembled from per-project partials.
  const partialShownRef = useRef(false);
  const graphRef = useRef(state.graph);
  // What the last changed round said was still pending server-side (change requests, a mirror sync).
  const lastPayloadPendingRef = useRef(false);

  const load = async (
    scope: MyWorkDigestScope,
    entries: ReadonlyArray<MyWorkDigestProjectInput>,
  ) => {
    const gen = generationRef.current;
    if (!enabled || entries.length === 0) return;
    const pollFn = readMyWorkDigestPollFn(backend);
    if (pollFn === undefined) {
      if (generationRef.current !== gen) return;
      patch({ error: "This server does not support the My Work digest yet.", status: "error" });
      return;
    }

    const firstAccount = entries[0]?.account.id;
    const viewerDisplayName = () =>
      input.viewer?.name?.trim() || readCachedAtlassianCurrentUserDisplayName(firstAccount) || "";
    const requestedViewer = viewerDisplayName();
    if (requestedViewerRef.current !== requestedViewer) fingerprintRef.current = undefined;
    requestedViewerRef.current = requestedViewer;
    patch({ refreshing: true });

    try {
      const result = await pollFn({
        scope,
        projects: entries,
        // The server's burndown join needs the Jira display name the mirror
        // assigns to; the cached name is the same one the chip wears.
        viewer: { name: requestedViewer },
        // "Yesterday" is the viewer's last working day, in the viewer's zone.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(fingerprintRef.current !== undefined
          ? { knownFingerprint: fingerprintRef.current }
          : {}),
      });
      if (generationRef.current !== gen) return;

      if (result.unchanged) {
        fingerprintRef.current = result.fingerprint;
        // An unchanged answer over a partial paint confirms nothing about the missing projects.
        if (!partialShownRef.current) allRoundLandedRef.current = true;
        // Same answer as the last changed round: its pending state still holds (and a retry
        // armed by a failed round stops here, now that the server answers again).
        pendingRetry.update(
          lastPayloadPendingRef.current,
          () => void loadRef.current(scope, entriesRef.current),
        );
        // The server confirmed what we already hold: a cached paint is now a fresh answer.
        patch({ freshness: "fresh", refreshing: false, sessionExpired: false });
        return;
      }

      fingerprintRef.current = result.fingerprint;
      const viewer: DigestViewer = {
        // The server resolves the viewer from the mirror (the exact string `ticket.assignee`
        // carries), so it is authoritative for the `isMine` join; the client's cached name is
        // only a fallback for a payload that could not resolve one.
        name: result.value.viewer?.name || requestedViewer || "",
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
      // A mirror still filling (first sync / catch-up) is pending too: keep re-reading until done.
      const syncPending = nextGraph.jiraSyncPending === true;
      lastPayloadPendingRef.current = crPending || syncPending;
      pendingRetry.update(
        lastPayloadPendingRef.current,
        () => void loadRef.current(scope, entriesRef.current),
      );
      allRoundLandedRef.current = true;
      partialShownRef.current = false;
      lastCheckedAtRef.current = Date.now();
      patch({
        viewerUnresolved: unresolved,
        sessionExpired: false,
        graph: nextGraph,
        status: "ready",
        error: undefined,
        freshness: "fresh",
        refreshing: false,
      });
    } catch (cause) {
      if (generationRef.current !== gen) return;
      // A dead refresh token is terminal: the server cleared the credentials, only sign-in recovers.
      if (isJiraSessionExpiredError(cause)) {
        patch({ sessionExpired: true, error: undefined, status: "error", refreshing: false });
        return;
      }
      // A failed fetch (backend booting, timeout, network) is transient: retry soon, backing off.
      pendingRetry.update(true, () => void loadRef.current(scope, entriesRef.current));
      // Projects already painted stay on screen; only a view with nothing to show says "retrying".
      patch(
        partialShownRef.current
          ? { refreshing: false }
          : { status: "retrying", error: undefined, refreshing: false },
      );
    }
  };

  /** Paint each project as it lands until the all-scope round answers (see the module header). */
  const startProgressive = (
    scopeEntries: ReadonlyArray<MyWorkDigestProjectInput>,
    generation: number,
  ) => {
    const pollFn = readMyWorkDigestPollFn(backend);
    if (pollFn === undefined) return;
    const isCancelled = () =>
      generationRef.current !== generation ||
      allRoundLandedRef.current ||
      // A stored graph for this scope is already on screen and fuller than any partial.
      (graphRef.current !== null && !partialShownRef.current);
    if (isCancelled()) return;
    const parts: ProgressiveDigestPart[] = [];
    const nameOf = (entry: MyWorkDigestProjectInput) =>
      projects.find((project) => project.id === entry.appProjectId)?.title.trim() ||
      entry.name?.trim() ||
      entry.externalProjectId;
    const paint = (remaining: ReadonlyArray<MyWorkDigestProjectInput>) => {
      const merged = mergeProgressiveParts(parts);
      if (merged.entries.length === 0) return;
      const graph = payloadToDigestGraph({
        payload: merged.payload,
        projects,
        entries: merged.entries,
        viewer: {
          name: merged.payload.viewer?.name || input.viewer?.name?.trim() || "",
          role: input.viewer?.role?.trim() || "",
          lastVisitAt: merged.payload.viewer?.lastVisitAt ?? LAST_VISIT_EPOCH,
        },
      });
      partialShownRef.current = true;
      patch({
        graph: {
          ...graph,
          ...(remaining.length > 0 ? { syncingProjects: remaining.map(nameOf) } : {}),
        },
        status: "ready",
        error: undefined,
        viewerUnresolved: merged.payload.viewer?.unresolved === true,
        // Partial: never an answer about the scope, so no empty state can come of it.
        freshness: "cached",
      });
    };
    const firstAccount = scopeEntries[0]?.account.id;
    void runProgressiveAllRounds({
      entries: orderProgressiveEntries(scopeEntries, graphRef.current),
      pollFn,
      viewerName:
        input.viewer?.name?.trim() || readCachedAtlassianCurrentUserDisplayName(firstAccount) || "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isCancelled,
      onPart: (part, remaining) => {
        parts.push(part);
        paint(remaining);
      },
      onSkip: (_entry, remaining) => {
        if (parts.length > 0) paint(remaining);
      },
    });
  };

  // The poller reads the latest loader through a ref (fresh backend/viewer on
  // every tick) while its subscription restarts only when scope or entries change.
  const loadRef = useRef(load);
  const startProgressiveRef = useRef(startProgressive);
  const entriesRef = useRef(entries);
  useEffect(() => {
    loadRef.current = load;
    startProgressiveRef.current = startProgressive;
    entriesRef.current = entries;
    graphRef.current = state.graph;
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
    requestedViewerRef.current = undefined;
    lastCheckedAtRef.current = undefined;
    allRoundLandedRef.current = false;
    partialShownRef.current = false;
    lastPayloadPendingRef.current = false;
    const generation = generationRef.current;
    if (scope === "all" && entries.length > 1) startProgressiveRef.current(entries, generation);
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

  // Nothing to load for an empty scope: report a settled, empty answer without touching state.
  const idle = enabled && entries.length === 0;

  return {
    graph: idle ? null : state.graph,
    status: idle ? "ready" : state.status,
    ...(state.error !== undefined && !idle ? { error: state.error } : {}),
    viewerUnresolved: state.viewerUnresolved,
    sessionExpired: idle ? false : state.sessionExpired,
    freshness: idle ? "fresh" : state.freshness,
    refreshing: !idle && state.refreshing,
    ...(lastCheckedAtRef.current !== undefined && !idle
      ? { updatedAt: lastCheckedAtRef.current }
      : {}),
    reload: () => {
      void loadRef.current(scope, entries);
    },
  };
}
