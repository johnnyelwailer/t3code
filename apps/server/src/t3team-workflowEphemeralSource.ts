/** Safe source replacement for one ephemeral workflow run. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const encodeJsonString = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

export class EphemeralWorkflowSourcePathError extends Schema.TaggedErrorClass<EphemeralWorkflowSourcePathError>()(
  "EphemeralWorkflowSourcePathError",
  { message: Schema.String },
) {}

export const resolveEphemeralWorkflowSourcePath = (input: {
  readonly runsRoot: string;
  readonly runId: string;
}): Effect.Effect<string, EphemeralWorkflowSourcePathError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (!runIdPattern.test(input.runId) || input.runId === "." || input.runId === "..") {
      return yield* new EphemeralWorkflowSourcePathError({
        message: "Invalid ephemeral workflow run id.",
      });
    }
    const root = path.resolve(input.runsRoot);
    const target = path.resolve(root, input.runId, "workflow.ts");
    const expected = path.join(root, input.runId, "workflow.ts");
    if (target !== expected || !target.startsWith(`${root}${path.sep}`)) {
      return yield* new EphemeralWorkflowSourcePathError({
        message: "Ephemeral workflow target escapes runs root.",
      });
    }
    return target;
  });

/**
 * Keeps the first pre-repair source as `workflow.ts.original` and atomically
 * swaps only the exact ephemeral `workflow.ts` target. Temp files are siblings
 * so rename remains an atomic same-filesystem operation.
 */
export const replaceEphemeralWorkflowSourceAtomically = (input: {
  readonly runsRoot: string;
  readonly runId: string;
  readonly source: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* resolveEphemeralWorkflowSourcePath(input);
    const directory = path.dirname(target);
    const auditPath = path.join(directory, "workflow.ts.original");
    const tempPath = path.join(directory, ".workflow.ts.repair.tmp");
    const auditTempPath = path.join(directory, ".workflow.ts.original.tmp");

    yield* fs.makeDirectory(directory, { recursive: true });
    const original = yield* fs.readFileString(target);
    const hasAudit = yield* fs.exists(auditPath);
    yield* fs
      .writeFileString(tempPath, input.source)
      .pipe(
        Effect.andThen(
          hasAudit
            ? Effect.void
            : fs
                .writeFileString(auditTempPath, original)
                .pipe(Effect.andThen(fs.rename(auditTempPath, auditPath))),
        ),
        Effect.andThen(fs.rename(tempPath, target)),
        Effect.ensuring(
          fs
            .remove(tempPath, { force: true })
            .pipe(Effect.andThen(fs.remove(auditTempPath, { force: true })), Effect.ignore),
        ),
      );
    return { target, auditPath };
  });

/**
 * Makes `.t3team-runs/` self-ignoring: idempotently writes a `.gitignore` containing `*` so every
 * run directory the engine persists under it (including this file itself) stays invisible to the
 * user's own `git status`. Never touches the user's own root `.gitignore` — the engine only owns
 * `.t3team-runs/`. Leaves an existing `.gitignore` untouched (the user may have customized it),
 * and never fails: a write failure here must not stop orchestration from launching.
 */
export const ensureEphemeralRunsGitignore = (input: { readonly runsRoot: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const gitignorePath = path.join(input.runsRoot, ".gitignore");
    const exists = yield* fs.exists(gitignorePath);
    if (exists) return;
    yield* fs.writeFileString(gitignorePath, "*\n");
  }).pipe(Effect.ignore);

/** Write one host-owned repair record. Sources stay in workflow.ts.original, not this log. */
export const writeEphemeralWorkflowRepairAudit = (input: {
  readonly runsRoot: string;
  readonly runId: string;
  readonly attempt: number;
  readonly timestamp: string;
  readonly originalError: string;
  readonly outcome: "recovered" | "failed";
  readonly summary?: string;
  readonly reason?: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* resolveEphemeralWorkflowSourcePath(input);
    const auditPath = path.join(
      path.dirname(target),
      `workflow.repair.${input.attempt}.audit.json`,
    );
    const record = {
      timestamp: input.timestamp,
      originalError: input.originalError,
      outcome: input.outcome,
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    };
    const encodedRecord = yield* encodeJsonString(record);
    yield* fs.writeFileString(auditPath, encodedRecord);
    return auditPath;
  });
