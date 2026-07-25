import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter } from "effect/unstable/http";

import {
  listLocalProviderSessions,
  normalizeWorkspacePath,
} from "./t3team-localProviderSessions.ts";
import { syncLocalProviderSessions } from "./t3team-localProviderSessions-sync.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { errorResponse, okJson, T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";

const activeClaudeSessionIds = Effect.gen(function* () {
  const result = yield* (yield* VcsProcess.VcsProcess)
    .run({
      operation: "localProviderSessions.activeClaudeSessions",
      command: "claude",
      args: ["agents", "--json"],
      cwd: process.cwd(),
      timeoutMs: 2_000,
      maxOutputBytes: 64_000,
    })
    .pipe(Effect.option);
  if (result._tag === "None") return [] as ReadonlyArray<string>;
  const agents = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Array(Schema.Struct({ sessionId: Schema.optional(Schema.String) })),
    ),
  )(result.value.stdout).pipe(Effect.option);
  return agents._tag === "Some"
    ? agents.value.flatMap((agent) => (agent.sessionId ? [agent.sessionId] : []))
    : [];
});

const syncRoute = HttpRouter.route(
  "POST",
  "/api/local-provider-sessions/sync",
  Effect.gen(function* () {
    if (!(yield* (yield* ServerSettingsService).getSettings).showLocalProviderSessions)
      return okJson({ results: [] });
    const results = yield* syncLocalProviderSessions().pipe(
      Effect.mapError(
        (cause) =>
          new T3TeamAtlassianError({ message: "Could not sync local provider sessions.", cause }),
      ),
    );
    return okJson({ results });
  }).pipe(Effect.catch(errorResponse)),
);

const workspaceRoute = HttpRouter.route(
  "GET",
  "/api/local-provider-sessions/workspaces",
  Effect.gen(function* () {
    if (!(yield* (yield* ServerSettingsService).getSettings).showLocalProviderSessions)
      return okJson({ workspaces: [] });
    const sessions = yield* listLocalProviderSessions().pipe(
      Effect.mapError(
        (cause) =>
          new T3TeamAtlassianError({ message: "Could not discover local workspaces.", cause }),
      ),
    );
    const workspaces = new Map<string, { cwd: string; providers: Set<string> }>();
    for (const session of sessions) {
      const key = normalizeWorkspacePath(session.cwd);
      const workspace = workspaces.get(key) ?? { cwd: session.cwd, providers: new Set<string>() };
      workspace.providers.add(session.provider === "codex" ? "Codex" : "Claude");
      workspaces.set(key, workspace);
    }
    return okJson({
      workspaces: [...workspaces.values()].map((workspace) => ({
        cwd: workspace.cwd,
        providers: [...workspace.providers].sort(),
      })),
    });
  }).pipe(Effect.catch(errorResponse)),
);

const claudeActivityRoute = HttpRouter.route(
  "GET",
  "/api/local-provider-sessions/claude-active",
  Effect.gen(function* () {
    if (!(yield* (yield* ServerSettingsService).getSettings).showLocalProviderSessions)
      return okJson({ sessionIds: [] });
    return okJson({
      sessionIds: yield* activeClaudeSessionIds.pipe(Effect.orElseSucceed(() => [])),
    });
  }).pipe(Effect.catch(errorResponse)),
);

export const localProviderSessionsRouteLayer = HttpRouter.addAll([
  syncRoute,
  workspaceRoute,
  claudeActivityRoute,
]);
