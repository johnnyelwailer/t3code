import { useCallback } from "react";
import type { MouseEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { usePrimaryEnvironmentId } from "~/environments/primary";
import { readEnvironmentApi } from "~/environmentApi";
import { readLocalApi } from "~/localApi";
import { useT3WorkActiveChatStore } from "~/t3work/t3work-activeChatStore";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import {
  buildContextAttachment,
  compactJson,
  type AddToChatRequest,
  isDirectoryBundlePayload,
  parseActiveThreadFromPath,
  sanitizeForFileName,
} from "~/t3work/t3work-addToChatUtils";

function addContextAttachmentToThread(threadId: string, attachment: T3WorkContextAttachment): void {
  useT3WorkAddToChatStore.getState().enqueueThreadAttachment(threadId, attachment);
}

export function useAddToChat() {
  const environmentId = usePrimaryEnvironmentId();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeChatTarget = useT3WorkActiveChatStore((state) => state.target);

  const addToChatFromRequest = useCallback(
    async (request: AddToChatRequest) => {
      const payload =
        typeof request.payload === "function" ? await request.payload() : request.payload;

      let relativePath: string | undefined;
      if (environmentId && request.projectWorkspaceRoot) {
        const environmentApi = readEnvironmentApi(environmentId);
        if (environmentApi) {
          if (isDirectoryBundlePayload(payload)) {
            try {
              await Promise.all(
                payload.files.map((file) =>
                  environmentApi.projects.writeFile({
                    cwd: request.projectWorkspaceRoot as string,
                    relativePath: file.relativePath,
                    contents: file.contents,
                  }),
                ),
              );
            } catch {
              // Keep chat injection working even when snapshot file persistence fails.
            }
          } else {
            const timestamp = new Date().toISOString().replaceAll(":", "-");
            const baseName = sanitizeForFileName(request.targetLabel);
            const nextRelativePath = `.t3work/context/${timestamp}-${baseName}.json`;
            try {
              await environmentApi.projects.writeFile({
                cwd: request.projectWorkspaceRoot,
                relativePath: nextRelativePath,
                contents: compactJson(payload),
              });
              relativePath = nextRelativePath;
            } catch {
              // Keep chat injection working even when snapshot file persistence fails.
            }
          }
        }
      }

      const attachment = buildContextAttachment({ request, relativePath, payload });

      if (activeChatTarget && activeChatTarget.projectId === request.projectId) {
        if (activeChatTarget.type === "thread") {
          addContextAttachmentToThread(activeChatTarget.threadId, attachment);
          return;
        }
        useT3WorkAddToChatStore.getState().enqueueKickoff({
          projectId: request.projectId,
          ticketId: activeChatTarget.ticketId,
          attachment,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const activeThread = parseActiveThreadFromPath(pathname);
      if (activeThread && activeThread.projectId === request.projectId) {
        addContextAttachmentToThread(activeThread.threadId, attachment);
        return;
      }

      useT3WorkAddToChatStore.getState().enqueue({
        projectId: request.projectId,
        attachment,
        createdAt: new Date().toISOString(),
      });
    },
    [activeChatTarget, environmentId, pathname],
  );

  const showAddToChatContextMenu = useCallback(
    async (event: MouseEvent, request: AddToChatRequest) => {
      event.preventDefault();
      event.stopPropagation();
      const localApi = readLocalApi();
      if (!localApi) {
        return;
      }
      const action = await localApi.contextMenu.show(
        [{ id: "add-to-chat", label: "Add to chat" }],
        { x: event.clientX, y: event.clientY },
      );
      if (action !== "add-to-chat") {
        return;
      }
      await addToChatFromRequest(request);
    },
    [addToChatFromRequest],
  );

  return {
    addToChatFromRequest,
    showAddToChatContextMenu,
  };
}
