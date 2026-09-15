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
import type { ProjectShellProject } from "@t3tools/project-context";

import {
  readMyWorkDigestPollFn,
  type MyWorkDigestProjectInput,
  type MyWorkDigestScope,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
  ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
  startBrowserPolling,
} from "~/t3team/hooks/t3team-integrationPolling";
import { readCachedAtlassianCurrentUserDisplayName } from "~/t3team/hooks/t3team-useAtlassianCurrentUserDisplayName";
import { payloadToDigestGraph, type DigestViewer } from "./t3team-digestGraphMappers";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type UseMyWorkDigestGraphInput = {
  /** The scoped project list: one entry for scope "project", all for "all". */
  readonly projects: ReadonlyArray<ProjectShellProject>;
  readonly scope?: MyWorkDigestScope;
  /** The viewer the plan heuristics match `assignee` against. */
  readonly viewer?: { readonly name?: string; readonly role?: string };
  readonly enabled?: boolean;
};

export type UseMyWorkDigestGraphResult = {
  readonly graph: DigestGraph | null;
  readonly status: "loading" | "ready" | "error";
  readonly error?: string;
  readonly reload: () => void;
};

const lastVisitStorageKey = (scope: MyWorkDigestScope) =>
  `t3team.mywork-digest.last-visit.${scope}`;

function readLastVisitAt(scope: MyWorkDigestScope): string {
  try {
    const raw = window.localStorage.getItem(lastVisitStorageKey(scope));
    if (raw !== null && Date.parse(raw) > 0) return raw;
  } catch {
    // localStorage may be unavailable (private mode); fall through to now.
  }
  return new Date(0).toISOString();
}

function writeLastVisitAt(scope: MyWorkDigestScope, at: string): void {
  try {
    window.localStorage.setItem(lastVisitStorageKey(scope), at);
  } catch {
    // Non-fatal: transitions simply widen to "everything" next visit.
  }
}

export function useMyWorkDigestGraph(input: UseMyWorkDigestGraphInput): UseMyWorkDigestGraphResult {
  const backend = useBackend();
  const [graph, setGraph] = useState<DigestGraph | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | undefined>(undefined);

  const projects = input.projects;
  const scope = input.scope ?? "project";
  const enabled = input.enabled ?? true;

  const entries = useMemo(
    () =>
      projects
        .filter(
          (project): project is ProjectShellProject =>
            project.source?.provider === "atlassian" &&
            typeof project.source.externalProjectId === "string" &&
            project.source.externalProjectId !== "" &&
            typeof project.source.accountId === "string",
        )
        .map((project) => {
          const entry: MyWorkDigestProjectInput = {
            account: {
              id: project.source.accountId as string,
              provider: project.source.provider,
            },
            externalProjectId: project.source.externalProjectId as string,
            appProjectId: project.id,
            name: project.title,
          };
          return entry;
        }),
    [projects],
  );

  const scopeKey = entries
    .map((entry) => `${entry.account.id}:${entry.externalProjectId}`)
    .join("|");
  const fingerprintRef = useRef<string | undefined>(undefined);
  const lastCheckedAtRef = useRef<number | undefined>(undefined);
  // Bumped when the scope signature changes so an in-flight load from the
  // previous scope cannot clobber the new one (same guard as useProjectMyWork).
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    setGraph(null);
    setStatus("loading");
    setError(undefined);
    fingerprintRef.current = undefined;
    lastCheckedAtRef.current = undefined;
  }, [scopeKey, scope]);

  const load = async () => {
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
      setGraph(nextGraph);
      setStatus("ready");
      setError(undefined);
      lastCheckedAtRef.current = Date.now();
    } catch (cause) {
      if (generationRef.current !== gen) return;
      setError(cause instanceof Error ? cause.message : "Failed to load the My Work digest.");
      setStatus("error");
    }
  };

  useEffect(() => {
    if (!enabled || entries.length === 0) {
      if (entries.length === 0 && enabled) {
        setStatus("ready");
        setGraph(null);
      }
      return;
    }
    const poller = startBrowserPolling({
      enabled: true,
      intervalMs: ATLASSIAN_RESOURCES_POLL_INTERVAL_MS,
      maxAgeMs: ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS,
      getUpdatedAt: () => lastCheckedAtRef.current,
      poll: load,
    });
    return () => poller.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeKey, scope]);

  return { graph, status, ...(error !== undefined ? { error } : {}), reload: load };
}
