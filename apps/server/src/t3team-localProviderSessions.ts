import * as NodeOS from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  parseClaudeLocalSession,
  parseCodexLocalSession,
  type LocalProviderSession,
} from "./t3team-localProviderSessionParsing.ts";

export {
  parseClaudeLocalSession,
  parseCodexLocalSession,
  type LocalProviderKind,
  type LocalProviderMessage,
  type LocalProviderSession,
} from "./t3team-localProviderSessionParsing.ts";

const MAX_CACHED_SESSIONS = 500;
// Keep each provider independently bounded. A global newest-only cap hides
// one provider when its matching session is older than another provider's.
const MAX_SESSIONS_PER_PROVIDER = 100;
const parsedSessionCache = new Map<
  string,
  { modifiedAt: number; session: LocalProviderSession | null }
>();

export const normalizeWorkspacePath = (value: string, hostPlatform: string): string => {
  const normalized = value.trim().replace(/[\\/]+$/u, "");
  return hostPlatform === "win32"
    ? normalized.replaceAll("/", "\\").toLocaleLowerCase()
    : normalized;
};

export const workspacePathsMatch = (left: string, right: string, hostPlatform: string): boolean =>
  normalizeWorkspacePath(left, hostPlatform) === normalizeWorkspacePath(right, hostPlatform);

const filesBelow: (
  root: string,
  depth: number,
) => Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> = Effect.fn(
  "localProviderSessions.filesBelow",
)(function* (root: string, depth: number) {
  if (depth < 0) return [] as ReadonlyArray<string>;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* fileSystem
    .readDirectory(root, { recursive: false })
    .pipe(Effect.orElseSucceed(() => []));
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry);
    const entryStat = yield* fileSystem.stat(entryPath).pipe(Effect.orElseSucceed(() => null));
    if (!entryStat) continue;
    if (entryStat.type === "File" && entryPath.endsWith(".jsonl")) {
      paths.push(entryPath);
    } else if (entryStat.type === "Directory") {
      paths.push(...(yield* filesBelow(entryPath, depth - 1)));
    }
  }
  return paths;
});

export const readLocalProviderSessionFile = Effect.fn("readLocalProviderSessionFile")(function* (
  provider: LocalProviderSession["provider"],
  filePath: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const info = yield* fileSystem.stat(filePath).pipe(Effect.orElseSucceed(() => null));
  if (!info) return null;
  const modifiedAt = Option.match(info.mtime, {
    onNone: () => 0,
    onSome: (value) => value.getTime(),
  });
  const cached = parsedSessionCache.get(filePath);
  if (cached?.modifiedAt === modifiedAt) return cached.session;
  const raw = yield* fileSystem.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
  const session = provider === "codex" ? parseCodexLocalSession(raw) : parseClaudeLocalSession(raw);
  if (parsedSessionCache.size >= MAX_CACHED_SESSIONS * 2) parsedSessionCache.clear();
  parsedSessionCache.set(filePath, { modifiedAt, session });
  return session;
});

export const listLocalProviderSessions = Effect.fn("listLocalProviderSessions")(
  function* (options?: {
    /**
     * Skip (stat, but do not parse) session files not modified after this
     * epoch-ms cutoff. The periodic safety sweep passes its previous run time:
     * parsing EVERY session file under ~/.codex/sessions and ~/.claude/projects
     * took ~60s per sweep on a real machine and starved the engine (GHE #143).
     */
    readonly modifiedAfterMs?: number;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = NodeOS.homedir();
    const [codexPaths, claudePaths] = yield* Effect.all([
      filesBelow(path.join(home, ".codex", "sessions"), 3),
      filesBelow(path.join(home, ".claude", "projects"), 2),
    ]);
    const paths = [
      ...codexPaths.map((filePath) => ({ provider: "codex" as const, filePath })),
      ...claudePaths.map((filePath) => ({ provider: "claudeAgent" as const, filePath })),
    ];
    const recentPaths = yield* Effect.forEach(paths, ({ provider, filePath }) =>
      Effect.gen(function* () {
        const info = yield* fileSystem.stat(filePath).pipe(Effect.orElseSucceed(() => null));
        return info
          ? {
              provider,
              filePath,
              modifiedAt: Option.match(info.mtime, {
                onNone: () => 0,
                onSome: (value) => value.getTime(),
              }),
            }
          : null;
      }),
    );
    const recentSessions = (["codex", "claudeAgent"] as const).flatMap((provider) =>
      recentPaths
        .filter(
          (value): value is NonNullable<typeof value> =>
            value !== null && value.provider === provider,
        )
        .sort((left, right) => right.modifiedAt - left.modifiedAt)
        .slice(0, MAX_SESSIONS_PER_PROVIDER)
        .filter(
          (value) =>
            options?.modifiedAfterMs === undefined || value.modifiedAt > options.modifiedAfterMs,
        ),
    );
    const sessions = yield* Effect.forEach(recentSessions, ({ provider, filePath }) =>
      readLocalProviderSessionFile(provider, filePath),
    );
    return sessions
      .filter((value): value is LocalProviderSession => value !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },
);
