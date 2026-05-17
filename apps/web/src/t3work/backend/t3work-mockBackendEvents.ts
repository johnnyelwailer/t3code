import type { ServerLifecycleStreamEvent } from "@t3tools/contracts";

export function now() {
  return new Date().toISOString();
}

export function randomId() {
  return `mock-${Math.random().toString(36).slice(2)}`;
}

export async function simulateMockConversation(
  threadId: string,
  userText: string,
  emitThreadEvent: (threadId: string, event: Record<string, unknown>) => void,
) {
  const turnId = randomId();
  const messageId = randomId();
  const assistantMessageId = randomId();

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.message-sent",
      threadId,
      messageId,
      role: "user",
      text: userText,
      turnId,
      streaming: false,
      createdAt: now(),
      updatedAt: now(),
    },
  });

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.turn-start-requested",
      threadId,
      turnId,
      messageId,
      modelSelection: { instanceId: "codex", model: "gpt-4o" },
      runtimeMode: "full-access",
      interactionMode: "default",
      requestedAt: now(),
      createdAt: now(),
    },
  });

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.session-set",
      threadId,
      session: {
        providerName: "codex",
        providerInstanceId: "codex",
        status: "running",
        activeTurnId: turnId,
        updatedAt: now(),
      },
    },
  });

  const words =
    "I'll help you with that. Let me analyze the codebase and provide a detailed response.";
  for (const word of words.split(" ")) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    emitThreadEvent(threadId, {
      type: "thread.event" as any,
      occurredAt: now(),
      payload: {
        type: "thread.message-sent",
        threadId,
        messageId: assistantMessageId,
        role: "assistant",
        text: `${word} `,
        turnId,
        streaming: true,
        createdAt: now(),
        updatedAt: now(),
      },
    });
  }

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.message-sent",
      threadId,
      messageId: assistantMessageId,
      role: "assistant",
      text: "",
      turnId,
      streaming: false,
      createdAt: now(),
      updatedAt: now(),
    },
  });

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.activity-appended",
      threadId,
      activity: {
        id: randomId(),
        tone: "info" as any,
        kind: "file_search",
        summary: "Analyzed repository structure: 42 files found",
        payload: {},
        turnId,
        createdAt: now(),
      },
    },
  });

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.turn-diff-completed",
      threadId,
      turnId,
      completedAt: now(),
      status: "ready" as any,
      files: [
        { path: "src/components/Button.tsx", additions: 12, deletions: 3 },
        { path: "src/styles.css", additions: 5, deletions: 0 },
      ],
      assistantMessageId,
      checkpointTurnCount: 1,
      createdAt: now(),
    },
  });

  emitThreadEvent(threadId, {
    type: "thread.event" as any,
    occurredAt: now(),
    payload: {
      type: "thread.session-set",
      threadId,
      session: {
        providerName: "codex",
        providerInstanceId: "codex",
        status: "ready",
        updatedAt: now(),
      },
    },
  });
}

export function emitMockWelcome(
  emitLifecycleEvent: (event: ServerLifecycleStreamEvent) => void,
): void {
  setTimeout(() => {
    emitLifecycleEvent({
      type: "welcome",
      payload: {
        version: "0.0.24",
        appName: "T3 Work",
        environmentId: "mock-env",
        authDescriptor: { requiresAuth: false, method: "none" },
      },
    } as any);
  }, 100);
}
