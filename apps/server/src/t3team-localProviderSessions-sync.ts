import {
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  findLocalProviderKind,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

import {
  listLocalProviderSessions,
  type LocalProviderSession,
  workspacePathsMatch,
} from "./t3team-localProviderSessions.ts";
import { resolveLocalProviderSessionBranch } from "./t3team-localProviderSessions-branch.ts";
import { findLocalProviderProject } from "./t3team-localProviderSessions-project.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionDirectory } from "./provider/Services/ProviderSessionDirectory.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";

// Both read the LOCAL_PROVIDER_KINDS table rather than branching on "codex": the resume shape and
// the instance a thread lands on are per-provider facts, and they belong next to each other.
const resumeCursor = (session: LocalProviderSession) =>
  findLocalProviderKind(session.provider)?.buildResumeCursor(session.nativeId) ?? {
    threadId: session.nativeId,
  };

const modelFor = (session: LocalProviderSession) => {
  const provider = ProviderDriverKind.make(session.provider);
  return {
    instanceId:
      findLocalProviderKind(session.provider)?.instanceId ??
      ProviderInstanceId.make(session.provider),
    model: session.model ?? DEFAULT_MODEL_BY_PROVIDER[provider]!,
  };
};

const isSameNativeSession = (
  binding: { readonly provider: string; readonly resumeCursor?: unknown | null },
  session: LocalProviderSession,
) => {
  if (
    binding.provider !== session.provider ||
    !binding.resumeCursor ||
    typeof binding.resumeCursor !== "object"
  )
    return false;
  const cursor = binding.resumeCursor as { threadId?: unknown; resume?: unknown };
  return cursor.threadId === session.nativeId || cursor.resume === session.nativeId;
};

export function syncLocalProviderSession(session: LocalProviderSession) {
  return Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const settings = yield* ServerSettingsService;
    if (!(yield* settings.getSettings).showLocalProviderSessions) {
      return yield* new T3TeamAtlassianError({
        message: "Local provider sessions are disabled in Settings.",
      });
    }
    // Injected, not read from process.platform: workspace paths compare case- and
    // separator-insensitively on Windows only.
    const hostPlatform = yield* HostProcessPlatform;
    const snapshot = yield* (yield* ProjectionSnapshotQuery).getSnapshot();
    const existingThread = snapshot.threads.find(
      (thread) =>
        thread.worktreePath !== null &&
        workspacePathsMatch(thread.worktreePath, session.cwd, hostPlatform),
    );
    const project =
      snapshot.projects.find((entry) => entry.id === existingThread?.projectId) ??
      (yield* findLocalProviderProject(session.cwd, snapshot.projects));
    if (!project) return { status: "skipped" as const, reason: "no matching worktree" };
    const branch = yield* resolveLocalProviderSessionBranch(session.cwd, session.branch);
    const directory = yield* ProviderSessionDirectory;
    const alreadyBound = (yield* directory.listBindings()).find((binding) =>
      isSameNativeSession(binding, session),
    );
    const orchestration = yield* OrchestrationEngineService;
    const modelSelection = modelFor(session);
    if (alreadyBound) {
      const thread = snapshot.threads.find((entry) => entry.id === alreadyBound.threadId);
      if (
        (branch && !thread?.branch) ||
        session.updatedAt > (thread?.updatedAt ?? "") ||
        thread?.modelSelection.model !== modelSelection.model
      ) {
        yield* orchestration.dispatch({
          type: "thread.meta.update",
          commandId: CommandId.make(yield* crypto.randomUUIDv4),
          threadId: alreadyBound.threadId,
          ...(branch && !thread?.branch ? { branch } : {}),
          ...(thread?.modelSelection.model !== modelSelection.model ? { modelSelection } : {}),
          worktreePath: session.cwd,
        });
      }
      // Only mirror native-session messages into threads this SYNC created
      // (marked localProviderSession in the binding's runtimePayload). An
      // app-managed thread already persists its transcript live under real
      // message ids, and importing the same conversation from the provider's
      // session file duplicated every message under a `local:` id (thread
      // e3596f60, 2026-08-24) — the id-based dedupe below can't see that.
      const syncOwnsTranscript =
        typeof alreadyBound.runtimePayload === "object" &&
        alreadyBound.runtimePayload !== null &&
        (alreadyBound.runtimePayload as { localProviderSession?: unknown }).localProviderSession ===
          true;
      if (!syncOwnsTranscript) {
        return { status: "existing" as const, threadId: alreadyBound.threadId };
      }
      const messageIds = new Set(thread?.messages.map((message) => message.id) ?? []);
      yield* Effect.forEach(session.messages, (message) =>
        Effect.gen(function* () {
          const messageId = MessageId.make(
            `local:${session.provider}:${session.nativeId}:${message.nativeIndex}`,
          );
          if (messageIds.has(messageId)) return;
          yield* orchestration.dispatch({
            type: "thread.message.upsert",
            commandId: CommandId.make(yield* crypto.randomUUIDv4),
            threadId: alreadyBound.threadId,
            message: {
              messageId,
              role: message.role,
              text: message.text,
              turnId: null,
              streaming: false,
            },
            createdAt: message.createdAt || session.updatedAt,
          });
        }),
      );
      return { status: "existing" as const, threadId: alreadyBound.threadId };
    }
    const threadId = ThreadId.make(yield* crypto.randomUUIDv4);
    const createdAt = session.updatedAt || DateTime.formatIso(yield* DateTime.now);
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(yield* crypto.randomUUIDv4),
      threadId,
      projectId: project.id,
      title: session.title,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch,
      worktreePath: session.cwd,
      createdAt,
    });
    yield* directory.upsert({
      threadId,
      provider: ProviderDriverKind.make(session.provider),
      providerInstanceId: modelSelection.instanceId,
      status: "stopped",
      runtimeMode: "full-access",
      resumeCursor: resumeCursor(session),
      runtimePayload: { cwd: session.cwd, localProviderSession: true },
    });
    yield* Effect.forEach(session.messages, (message) =>
      Effect.gen(function* () {
        yield* orchestration.dispatch({
          type: "thread.message.upsert",
          commandId: CommandId.make(yield* crypto.randomUUIDv4),
          threadId,
          message: {
            messageId: MessageId.make(
              `local:${session.provider}:${session.nativeId}:${message.nativeIndex}`,
            ),
            role: message.role,
            text: message.text,
            turnId: null,
            streaming: false,
          },
          createdAt: message.createdAt || createdAt,
        });
      }),
    );
    return { status: "created" as const, threadId };
  });
}

export const syncLocalProviderSessions = Effect.fn("syncLocalProviderSessions")(function* () {
  const sessions = yield* listLocalProviderSessions();
  return yield* Effect.forEach(sessions, (session) =>
    syncLocalProviderSession(session).pipe(
      Effect.map((result) => ({
        provider: session.provider,
        nativeId: session.nativeId,
        ...result,
      })),
      Effect.catch((error) =>
        Effect.succeed({
          provider: session.provider,
          nativeId: session.nativeId,
          status: "skipped" as const,
          reason: error instanceof Error ? error.message : "Could not sync session.",
        }),
      ),
    ),
  );
});
