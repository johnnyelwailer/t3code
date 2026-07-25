import {
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  listLocalProviderSessions,
  type LocalProviderSession,
  workspacePathsMatch,
} from "./localProviderSessions.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionDirectory } from "./provider/Services/ProviderSessionDirectory.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { errorResponse, okJson, T3TeamAtlassianError } from "./t3team-atlassian-http.ts";

function resumeCursor(session: LocalProviderSession) {
  return session.provider === "codex"
    ? { threadId: session.nativeId }
    : { resume: session.nativeId, threadId: session.nativeId };
}

function modelFor(session: LocalProviderSession) {
  const provider = ProviderDriverKind.make(session.provider);
  const model = DEFAULT_MODEL_BY_PROVIDER[provider]!;
  return {
    instanceId: ProviderInstanceId.make(session.provider === "codex" ? "codex" : "claudeAgent"),
    model,
  };
}

function isSameNativeSession(
  binding: { readonly provider: string; readonly resumeCursor?: unknown | null },
  session: LocalProviderSession,
) {
  if (
    binding.provider !== session.provider ||
    !binding.resumeCursor ||
    typeof binding.resumeCursor !== "object"
  ) {
    return false;
  }
  const cursor = binding.resumeCursor as { threadId?: unknown; resume?: unknown };
  return cursor.threadId === session.nativeId || cursor.resume === session.nativeId;
}

function syncSession(session: LocalProviderSession) {
  return Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const settings = yield* ServerSettingsService;
    const activeSettings = yield* settings.getSettings;
    if (!activeSettings.showLocalProviderSessions) {
      return yield* new T3TeamAtlassianError({
        message: "Local provider sessions are disabled in Settings.",
      });
    }
    const query = yield* ProjectionSnapshotQuery;
    const snapshot = yield* query.getSnapshot();
    const existingThread = snapshot.threads.find(
      (thread) =>
        thread.worktreePath !== null && workspacePathsMatch(thread.worktreePath, session.cwd),
    );
    const project =
      snapshot.projects.find((entry) => workspacePathsMatch(entry.workspaceRoot, session.cwd)) ??
      snapshot.projects.find((entry) => entry.id === existingThread?.projectId);
    if (!project) return { status: "skipped" as const, reason: "no matching worktree" };

    const directory = yield* ProviderSessionDirectory;
    const existing = yield* directory.listBindings();
    const alreadyBound = existing.find((binding) => isSameNativeSession(binding, session));
    if (alreadyBound) return { status: "existing" as const, threadId: alreadyBound.threadId };

    const orchestration = yield* OrchestrationEngineService;
    const threadId = ThreadId.make(yield* crypto.randomUUIDv4);
    const createdAt = session.updatedAt || DateTime.formatIso(yield* DateTime.now);
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(yield* crypto.randomUUIDv4),
      threadId,
      projectId: project.id,
      title: session.title,
      modelSelection: modelFor(session),
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: session.cwd,
      createdAt,
    });
    yield* directory.upsert({
      threadId,
      provider: ProviderDriverKind.make(session.provider),
      providerInstanceId: modelFor(session).instanceId,
      status: "stopped",
      runtimeMode: "full-access",
      resumeCursor: resumeCursor(session),
      runtimePayload: { cwd: session.cwd, localProviderSession: true },
    });
    yield* Effect.forEach(session.messages, (message, index) =>
      Effect.gen(function* () {
        yield* orchestration.dispatch({
          type: "thread.message.upsert",
          commandId: CommandId.make(yield* crypto.randomUUIDv4),
          threadId,
          message: {
            messageId: MessageId.make(`local:${session.provider}:${session.nativeId}:${index}`),
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
    syncSession(session).pipe(
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

export const localProviderSessionsRouteLayer = HttpRouter.add(
  "GET",
  "/api/local-provider-sessions/workspaces",
  Effect.gen(function* () {
    const settings = yield* ServerSettingsService;
    if (!(yield* settings.getSettings).showLocalProviderSessions) {
      return okJson({ workspaces: [] });
    }
    const sessions = yield* listLocalProviderSessions().pipe(
      Effect.mapError(
        (cause) =>
          new T3TeamAtlassianError({ message: "Could not discover local workspaces.", cause }),
      ),
    );
    const workspaces = new Map<string, Set<string>>();
    for (const session of sessions) {
      const providers = workspaces.get(session.cwd) ?? new Set<string>();
      providers.add(session.provider === "codex" ? "Codex" : "Claude");
      workspaces.set(session.cwd, providers);
    }
    return okJson({
      workspaces: [...workspaces].map(([cwd, providers]) => ({
        cwd,
        providers: [...providers].sort(),
      })),
    });
  }).pipe(Effect.catch(errorResponse)),
);
