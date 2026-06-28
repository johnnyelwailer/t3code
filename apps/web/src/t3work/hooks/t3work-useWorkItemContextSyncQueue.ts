import type { ProjectShellProject } from "@t3tools/project-context";
import { useEffect, useRef } from "react";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import { ensureFullWorkItemContextBundle } from "~/t3work/t3work-ensureFullWorkItemContextBundle";
import {
  assertTicketKeyInProjectScope,
  resolveTicketForScopedKey,
} from "~/t3work/t3work-contextScopeValidation";

type ContextSyncQueueRequest = {
  readonly id: string;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly ticketKey: string;
};

export function useWorkItemContextSyncQueue(input: {
  backend?: BackendApi;
  threadId: string | undefined;
  project: ProjectShellProject | undefined;
  ticketId?: string;
  ticketDisplayId?: string;
  enabled?: boolean;
}) {
  const store = useProjectStore();
  const inFlightRequestIds = useRef(new Set<string>());

  useEffect(() => {
    if (
      input.enabled === false ||
      !input.backend ||
      !input.threadId ||
      !input.project?.workspace?.rootPath
    ) {
      return;
    }

    const backend = input.backend;
    const threadId = input.threadId;
    const project = input.project;
    const projectTickets = store.getTicketsForProject(project.id);

    let cancelled = false;
    const poll = async () => {
      if (cancelled) {
        return;
      }

      const queue = await backend.projectWorkspace.listContextSyncQueue({
        threadId,
      });
      for (const request of queue.requests as ReadonlyArray<ContextSyncQueueRequest>) {
        if (cancelled || inFlightRequestIds.current.has(request.id)) {
          continue;
        }
        if (
          request.projectId !== project.id ||
          request.workspaceRoot !== project.workspace?.rootPath
        ) {
          continue;
        }

        inFlightRequestIds.current.add(request.id);
        try {
          const scopedKey = assertTicketKeyInProjectScope({
            projectId: project.id,
            ticketKey: request.ticketKey,
            projectTickets,
            ...(input.ticketId ? { currentTicketId: input.ticketId } : {}),
            ...(input.ticketDisplayId ? { currentTicketDisplayId: input.ticketDisplayId } : {}),
          });
          const ticket = resolveTicketForScopedKey({
            ticketKey: scopedKey,
            projectTickets,
          });
          if (!ticket) {
            continue;
          }

          await ensureFullWorkItemContextBundle({
            backend,
            project,
            ticket,
            projectTickets,
            githubActivityItems: [],
          });
          await backend.projectWorkspace.completeContextSync({
            threadId,
            requestId: request.id,
          });
        } catch {
          // Best-effort queue drain; the agent tool can retry.
        } finally {
          inFlightRequestIds.current.delete(request.id);
        }
      }
    };

    const intervalId = globalThis.setInterval(() => {
      void poll();
    }, 1_000);
    void poll();

    return () => {
      cancelled = true;
      globalThis.clearInterval(intervalId);
    };
  }, [
    input.backend,
    input.enabled,
    input.project,
    input.threadId,
    input.ticketDisplayId,
    input.ticketId,
    store,
  ]);
}
