import { homedir } from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

export type LocalProviderKind = "codex" | "claudeAgent";

export interface LocalProviderMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}

export interface LocalProviderSession {
  readonly provider: LocalProviderKind;
  readonly nativeId: string;
  readonly cwd: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly messages: ReadonlyArray<LocalProviderMessage>;
}

const MAX_FILES = 500;
const MAX_SESSIONS = 100;
const MAX_MESSAGES = 100;

const textFromContent = (content: unknown): string => {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as { text?: unknown };
      return typeof value.text === "string" ? value.text : "";
    })
    .join("\n")
    .trim();
};

const titleFrom = (messages: ReadonlyArray<LocalProviderMessage>, fallback: string): string => {
  const text = messages.find((message) => message.role === "user")?.text?.replace(/\s+/g, " ");
  return text ? text.slice(0, 90) : fallback;
};

export const parseCodexLocalSession = (raw: string): LocalProviderSession | null => {
  const messages: LocalProviderMessage[] = [];
  let nativeId = "";
  let cwd = "";
  let updatedAt = "";
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as {
        timestamp?: unknown;
        type?: unknown;
        payload?: {
          id?: unknown;
          cwd?: unknown;
          type?: unknown;
          role?: unknown;
          content?: unknown;
        };
      };
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : "";
      updatedAt = timestamp || updatedAt;
      if (row.type === "session_meta") {
        nativeId = typeof row.payload?.id === "string" ? row.payload.id : nativeId;
        cwd = typeof row.payload?.cwd === "string" ? row.payload.cwd : cwd;
      }
      if (row.type === "response_item" && row.payload?.type === "message") {
        const role = row.payload.role;
        const text = textFromContent(row.payload.content);
        if ((role === "user" || role === "assistant") && text) {
          messages.push({ role, text, createdAt: timestamp });
        }
      }
    } catch {}
  }
  if (!nativeId || !cwd) return null;
  return {
    provider: "codex",
    nativeId,
    cwd,
    title: titleFrom(messages, "Codex session"),
    updatedAt,
    messages: messages.slice(-MAX_MESSAGES),
  };
};

export const parseClaudeLocalSession = (raw: string): LocalProviderSession | null => {
  const messages: LocalProviderMessage[] = [];
  let nativeId = "";
  let cwd = "";
  let updatedAt = "";
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line) as {
        sessionId?: unknown;
        cwd?: unknown;
        timestamp?: unknown;
        message?: { role?: unknown; content?: unknown };
      };
      nativeId = typeof row.sessionId === "string" ? row.sessionId : nativeId;
      cwd = typeof row.cwd === "string" ? row.cwd : cwd;
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : "";
      updatedAt = timestamp || updatedAt;
      const role = row.message?.role;
      const text = textFromContent(row.message?.content);
      if ((role === "user" || role === "assistant") && text) {
        messages.push({ role, text, createdAt: timestamp });
      }
    } catch {}
  }
  if (!nativeId || !cwd) return null;
  return {
    provider: "claudeAgent",
    nativeId,
    cwd,
    title: titleFrom(messages, "Claude session"),
    updatedAt,
    messages: messages.slice(-MAX_MESSAGES),
  };
};

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
    if (paths.length >= MAX_FILES) break;
    const entryPath = path.join(root, entry);
    const entryStat = yield* fileSystem.stat(entryPath).pipe(Effect.orElseSucceed(() => null));
    if (!entryStat) continue;
    if (entryStat.type === "File" && entryPath.endsWith(".jsonl")) {
      paths.push(entryPath);
    } else if (entryStat.type === "Directory") {
      paths.push(...(yield* filesBelow(entryPath, depth - 1)));
    }
  }
  return paths.slice(0, MAX_FILES);
});

export const listLocalProviderSessions = Effect.fn("listLocalProviderSessions")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = homedir();
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
  const sessions = yield* Effect.forEach(
    recentPaths
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .slice(0, MAX_SESSIONS),
    ({ provider, filePath }) =>
      Effect.gen(function* () {
        const raw = yield* fileSystem.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
        return provider === "codex" ? parseCodexLocalSession(raw) : parseClaudeLocalSession(raw);
      }),
  );
  return sessions
    .filter((value): value is LocalProviderSession => value !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
});
