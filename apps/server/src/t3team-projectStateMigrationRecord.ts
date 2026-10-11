/**
 * The persisted state of a handed-off state-dir migration: one JSON file in the receiving
 * checkout's references dir (gitignored, and excluded from the migration itself). The switch
 * route writes it `pending`, the launcher `running`, and the migration recipe's outcome script
 * `completed` / `failed` — the file the status route reads and the dialog polls.
 *
 * @module t3team-projectStateMigrationRecord
 */
import { ProjectStateMigration } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeFileStringAtomically } from "./atomicWrite.ts";
import { HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME } from "./t3team-project-repository-utils.ts";

const STATE_MIGRATION_RECORD_FILE = "state-migration.json";

/** Workspace-relative: the recipe's outcome script writes it through its workspace root. */
export const STATE_MIGRATION_RECORD_RELATIVE_PATH = `${HIDDEN_T3TEAM_DIR}/${REFERENCES_DIR_NAME}/${STATE_MIGRATION_RECORD_FILE}`;

const decodeRecord = Schema.decodeUnknownOption(Schema.fromJsonString(ProjectStateMigration));

export const isTerminalStateMigration = (record: Pick<ProjectStateMigration, "status">) =>
  record.status === "completed" || record.status === "failed";

const recordPath = (path: Path.Path, toRoot: string) =>
  path.join(toRoot, STATE_MIGRATION_RECORD_RELATIVE_PATH);

/** The record under `toRoot`, or undefined when there is none (or it does not decode). */
export const readStateMigrationRecord = Effect.fn("readStateMigrationRecord")(function* (
  toRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const contents = yield* fileSystem
    .readFileString(recordPath(path, toRoot))
    .pipe(Effect.orElseSucceed(() => ""));
  const decoded = decodeRecord(contents);
  return decoded._tag === "Some" ? decoded.value : undefined;
});

function formatStateMigrationRecord(record: ProjectStateMigration): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export const writeStateMigrationRecord = Effect.fn("writeStateMigrationRecord")(function* (
  record: ProjectStateMigration,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = recordPath(path, record.toRoot);
  yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
  // Atomic: the status route reads it while the launcher writes it.
  yield* writeFileStringAtomically({
    filePath: target,
    contents: formatStateMigrationRecord(record),
  });
});

/**
 * Merges `patch` into the record of `migrationId` and returns the result. A record already
 * completed or failed is returned unchanged (the recipe may finish before the launcher records
 * `running`); a record of another migration is left alone (undefined).
 */
export const updateStateMigrationRecord = Effect.fn("updateStateMigrationRecord")(function* (
  toRoot: string,
  migrationId: string,
  patch: Partial<Omit<ProjectStateMigration, "migrationId" | "fromRoot" | "toRoot">>,
) {
  const current = yield* readStateMigrationRecord(toRoot);
  if (!current || current.migrationId !== migrationId) return undefined;
  if (isTerminalStateMigration(current)) return current;
  const next: ProjectStateMigration = {
    ...current,
    ...patch,
    updatedAt: DateTime.formatIso(yield* DateTime.now),
  };
  yield* writeStateMigrationRecord(next);
  return next;
});
