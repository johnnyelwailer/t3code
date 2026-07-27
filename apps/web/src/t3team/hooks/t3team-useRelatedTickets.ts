import { useEffect, useMemo, useState } from "react";
import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  extractRelationshipKeys,
  normalizeRelationshipKey,
} from "~/t3team/t3team-ticketRelationshipKeys";
import { snapshotToProjectTicket } from "~/t3team/t3team-ticketMappers";
import {
  fetchAtlassianResourceSnapshot,
  readCachedAtlassianResourceSnapshot,
} from "~/t3team/t3team-atlassianResourceSnapshotCache";

function buildTicketLookup(tickets: readonly ProjectTicket[]): Map<string, ProjectTicket> {
  const map = new Map<string, ProjectTicket>();
  for (const ticket of tickets) {
    map.set(ticket.id, ticket);
    map.set(ticket.ref.id, ticket);
    map.set(ticket.ref.displayId, ticket);
  }
  return map;
}

function mergeTickets(
  baseTickets: readonly ProjectTicket[],
  relatedTickets: readonly ProjectTicket[],
): ProjectTicket[] {
  const map = new Map<string, ProjectTicket>();
  for (const ticket of baseTickets) {
    map.set(ticket.id, ticket);
  }
  for (const ticket of relatedTickets) {
    map.set(ticket.id, ticket);
  }
  return [...map.values()];
}

export function useRelatedTickets({
  project,
  snapshot,
  projectTickets,
  currentTicketId,
  currentDisplayId,
}: {
  project: ProjectShellProject;
  snapshot: ResourceSnapshot | null;
  projectTickets: ProjectTicket[];
  currentTicketId: string;
  currentDisplayId: string;
}) {
  const backend = useBackend();
  const [relatedTickets, setRelatedTickets] = useState<ProjectTicket[]>([]);

  const relationshipKeys = useMemo(() => {
    const raw = snapshot?.raw;
    if (!raw) {
      return { parentKey: undefined, childKeys: [], referenceKeys: [] };
    }
    return extractRelationshipKeys(raw);
  }, [snapshot?.raw]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!backend || !snapshot || !project.source.accountId || !project.source.externalProjectId) {
        setRelatedTickets([]);
        return;
      }
      const lookup = buildTicketLookup(projectTickets);
      const ignoredKeys = new Set(
        [currentTicketId, currentDisplayId, snapshot.ref.id, snapshot.ref.displayId]
          .map((value) => normalizeRelationshipKey(value))
          .filter((value): value is string => typeof value === "string"),
      );

      const allKeys = new Set<string>();
      if (relationshipKeys.parentKey) allKeys.add(relationshipKeys.parentKey);
      for (const key of relationshipKeys.childKeys) allKeys.add(key);
      for (const key of relationshipKeys.referenceKeys) allKeys.add(key);

      const missingKeys = [...allKeys].filter((key) => !ignoredKeys.has(key) && !lookup.has(key));
      if (missingKeys.length === 0) {
        setRelatedTickets([]);
        return;
      }

      const fromCache: ProjectTicket[] = [];
      const unresolvedKeys: string[] = [];

      for (const key of missingKeys) {
        const cachedSnapshot = readCachedAtlassianResourceSnapshot({
          project,
          key,
        });
        if (!cachedSnapshot) {
          unresolvedKeys.push(key);
          continue;
        }
        fromCache.push(snapshotToProjectTicket(project.id, cachedSnapshot, project.source.accountId));
      }

      if (!cancelled) {
        setRelatedTickets(fromCache);
      }

      const fetched = await Promise.all(
        unresolvedKeys.map(async (key) => {
          try {
            const result = await fetchAtlassianResourceSnapshot({
              backend,
              project,
              key,
            });
            return snapshotToProjectTicket(project.id, result, project.source.accountId);
          } catch {
            // Ignore unavailable keys; unresolved entries are still rendered by key.
            return null;
          }
        }),
      );

      // A NEW array, never the one already handed to `setRelatedTickets` above.
      // Mutating that array and setting it again is an identity no-op: React
      // bails out on `Object.is`, so the fetched tickets never reached the view
      // until some unrelated re-render happened to re-run this effect.
      const resolved = fetched.filter((ticket) => ticket !== null);
      if (!cancelled && resolved.length > 0) {
        setRelatedTickets([...fromCache, ...resolved]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    backend,
    currentDisplayId,
    currentTicketId,
    project,
    projectTickets,
    relationshipKeys,
    snapshot,
  ]);

  const ticketsWithRelated = useMemo(
    () => mergeTickets(projectTickets, relatedTickets),
    [projectTickets, relatedTickets],
  );

  return { relatedTickets, ticketsWithRelated };
}
