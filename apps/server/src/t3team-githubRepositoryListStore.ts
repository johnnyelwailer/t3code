/**
 * The repository lists a GitHub host answered with, kept on disk so opening the repository picker
 * never has to wait on (or spend rate quota for) a fresh listing. The in-memory caches in
 * `t3team-github-routes-shared` expire after two minutes and vanish on restart; this survives both,
 * and the loader treats it stale-while-revalidate: serve what is stored at once, refresh it in the
 * background once it is older than `REPOSITORY_LIST_SOFT_TTL_MS`.
 *
 * @module t3team-githubRepositoryListStore
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import { ServerConfig } from "./config.ts";
import type { GitHubRepositoryCandidate } from "./t3team-github-routes-shared.ts";

/** Older than this and the stored list is shown, then refreshed in the background. */
export const REPOSITORY_LIST_SOFT_TTL_MS = 6 * 60 * 60_000;
const STORE_FILE = "github-repository-lists.json";
const MAX_STORED_LISTS = 64;

const StoredRepositoryListSchema = Schema.Struct({
  fetchedAt: Schema.String,
  items: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      nameWithOwner: Schema.String,
      url: Schema.String,
      host: Schema.String,
      updatedAt: Schema.optionalKey(Schema.String),
      description: Schema.optionalKey(Schema.String),
      isPrivate: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});
export type StoredRepositoryList = typeof StoredRepositoryListSchema.Type;

const StoredFileJson = Schema.fromJsonString(
  Schema.Record(Schema.String, StoredRepositoryListSchema),
);
const decodeStoredFile = Schema.decodeEffect(StoredFileJson);
const encodeStoredFile = Schema.encodeEffect(StoredFileJson);

/** One host's lists per state directory, loaded from disk on first use. */
const mirrors = new Map<string, Map<string, StoredRepositoryList>>();

const readMirror = Effect.fn("githubRepositoryListStore.readMirror")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stateDir } = yield* ServerConfig;
  const existing = mirrors.get(stateDir);
  if (existing) return { mirror: existing, file: path.join(stateDir, "t3team", STORE_FILE) };
  const file = path.join(stateDir, "t3team", STORE_FILE);
  const mirror = new Map<string, StoredRepositoryList>();
  const raw = yield* fileSystem.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
  // A missing or corrupt cache is just an empty one: the next listing rewrites it.
  const stored: Readonly<Record<string, StoredRepositoryList>> =
    raw.length > 0 ? yield* decodeStoredFile(raw).pipe(Effect.orElseSucceed(() => ({}))) : {};
  for (const [key, value] of Object.entries(stored)) mirror.set(key, value);
  mirrors.set(stateDir, mirror);
  return { mirror, file };
});

export const readStoredRepositoryList = Effect.fn("githubRepositoryListStore.read")(function* (
  key: string,
) {
  const { mirror } = yield* readMirror();
  return mirror.get(key);
});

export const writeStoredRepositoryList = Effect.fn("githubRepositoryListStore.write")(function* (
  key: string,
  items: ReadonlyArray<GitHubRepositoryCandidate>,
  fetchedAt?: string,
) {
  const { mirror, file } = yield* readMirror();
  mirror.delete(key);
  mirror.set(key, { fetchedAt: fetchedAt ?? DateTime.formatIso(yield* DateTime.now), items });
  while (mirror.size > MAX_STORED_LISTS) {
    const oldest = mirror.keys().next().value;
    if (typeof oldest !== "string") break;
    mirror.delete(oldest);
  }
  // Persisting is best effort: the in-memory mirror already holds the list for this run.
  yield* encodeStoredFile(Object.fromEntries(mirror)).pipe(
    Effect.flatMap((contents) => writeFileStringAtomically({ filePath: file, contents })),
    Effect.ignore({ log: true }),
  );
});

export const storedRepositoryListIsStale = (list: StoredRepositoryList, nowMs: number): boolean =>
  nowMs - Date.parse(list.fetchedAt) > REPOSITORY_LIST_SOFT_TTL_MS;
