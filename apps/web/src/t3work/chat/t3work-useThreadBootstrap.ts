import { useEffect, useRef } from "react";
import {
  DEFAULT_MODEL,
  DEFAULT_RUNTIME_MODE,
  ProviderInstanceId,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import type { BackendApi } from "~/t3work/backend/t3work-types";

type BackendLike = {
  dispatchCommand: BackendApi["dispatchCommand"];
};

type ThreadBootstrapInput = {
  backend: BackendLike | null | undefined;
  environmentId: string | null | undefined;
  threadId: string;
  projectTitle: string;
  projectWorkspaceRoot: string | undefined;
  canonicalProjectId: string;
  title: string;
  initialUserMessage: string | undefined;
  initialModelSelection: ModelSelection | undefined;
  initialRuntimeMode: RuntimeMode | undefined;
  initialInteractionMode: ProviderInteractionMode | undefined;
  onInitialUserMessageSent: (() => void) | undefined;
  serverThread: unknown | undefined;
};

export function useThreadBootstrap({
  backend,
  environmentId,
  threadId,
  projectTitle,
  projectWorkspaceRoot,
  canonicalProjectId,
  title,
  initialUserMessage,
  initialModelSelection,
  initialRuntimeMode,
  initialInteractionMode,
  onInitialUserMessageSent,
  serverThread,
}: ThreadBootstrapInput): void {
  const threadCreateSentRef = useRef(false);
  const kickoffSentRef = useRef(false);

  useEffect(() => {
    if (!backend || !environmentId) {
      return;
    }

    const createdAt = new Date().toISOString();
    const kickoffModelSelection =
      initialModelSelection ??
      ({
        instanceId: ProviderInstanceId.make("codex"),
        model: DEFAULT_MODEL,
      } as ModelSelection);
    const kickoffRuntimeMode = initialRuntimeMode ?? DEFAULT_RUNTIME_MODE;
    const kickoffInteractionMode = initialInteractionMode ?? ("default" as ProviderInteractionMode);

    const ensureProject = async () => {
      if (!projectWorkspaceRoot) {
        return;
      }
      try {
        await backend.dispatchCommand({
          type: "project.create",
          commandId: crypto.randomUUID() as any,
          projectId: canonicalProjectId as any,
          title: projectTitle,
          workspaceRoot: projectWorkspaceRoot,
          createWorkspaceRootIfMissing: true,
          defaultModelSelection: kickoffModelSelection,
          createdAt,
        });
      } catch {
        // Duplicate project errors are expected if it already exists.
      }
    };

    const ensureThread = async () => {
      await ensureProject();

      if (initialUserMessage) {
        if (kickoffSentRef.current) {
          return;
        }
        kickoffSentRef.current = true;

        await backend.dispatchCommand({
          type: "thread.turn.start",
          commandId: crypto.randomUUID() as any,
          threadId: threadId as any,
          message: {
            messageId: crypto.randomUUID() as any,
            role: "user",
            text: initialUserMessage,
            attachments: [],
          },
          modelSelection: kickoffModelSelection,
          titleSeed: title,
          runtimeMode: kickoffRuntimeMode,
          interactionMode: kickoffInteractionMode,
          bootstrap: {
            createThread: {
              projectId: canonicalProjectId as any,
              title,
              modelSelection: kickoffModelSelection,
              runtimeMode: kickoffRuntimeMode,
              interactionMode: kickoffInteractionMode,
              branch: null,
              worktreePath: null,
              createdAt,
            },
          },
          createdAt,
        });
        onInitialUserMessageSent?.();
        return;
      }

      if (serverThread || threadCreateSentRef.current) {
        return;
      }

      threadCreateSentRef.current = true;
      await backend.dispatchCommand({
        type: "thread.create",
        commandId: crypto.randomUUID() as any,
        threadId: threadId as any,
        projectId: canonicalProjectId as any,
        title,
        modelSelection: kickoffModelSelection,
        runtimeMode: kickoffRuntimeMode,
        interactionMode: kickoffInteractionMode,
        branch: null,
        worktreePath: null,
        createdAt,
      });
    };

    void ensureThread().catch(() => {
      if (initialUserMessage) {
        kickoffSentRef.current = false;
      } else {
        threadCreateSentRef.current = false;
      }
    });
  }, [
    backend,
    canonicalProjectId,
    environmentId,
    initialInteractionMode,
    initialModelSelection,
    initialRuntimeMode,
    initialUserMessage,
    onInitialUserMessageSent,
    projectTitle,
    projectWorkspaceRoot,
    serverThread,
    threadId,
    title,
  ]);
}
