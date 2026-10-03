/**
 * Fork thread artifacts side store: durable rich rows in
 * `t3team_thread_artifacts` plus a live per-thread change feed for
 * `t3team.subscribeThreadArtifacts`.
 *
 * Writers upsert by artifact id (pick a deterministic id for idempotent
 * writes); an identical re-upsert writes nothing. An artifact never moves to
 * another thread. Subscribers start from the thread's snapshot, so a missed
 * live change is repaired by resubscribing.
 */
import {
  type MessageId,
  T3TeamThreadArtifact,
  type T3TeamThreadArtifactsStreamEvent,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

export class T3TeamThreadArtifactsStoreError extends Schema.TaggedError<T3TeamThreadArtifactsStoreError>()(
  "T3TeamThreadArtifactsStoreError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export interface T3TeamThreadArtifactInput {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly messageId?: MessageId | null;
  readonly kind: string;
  readonly payload: unknown;
}

const isStoreError = Schema.is(T3TeamThreadArtifactsStoreError);

type ArtifactChange = Exclude<T3TeamThreadArtifactsStreamEvent, { readonly type: "snapshot" }>;

export class T3TeamThreadArtifactsStore extends Context.Service<
  T3TeamThreadArtifactsStore,
  {
    readonly upsert: (
      input: T3TeamThreadArtifactInput,
    ) => Effect.Effect<T3TeamThreadArtifact, T3TeamThreadArtifactsStoreError>;
    readonly get: (
      artifactId: string,
    ) => Effect.Effect<T3TeamThreadArtifact | null, T3TeamThreadArtifactsStoreError>;
    /** Oldest first. */
    readonly listByThread: (
      threadId: ThreadId,
    ) => Effect.Effect<ReadonlyArray<T3TeamThreadArtifact>, T3TeamThreadArtifactsStoreError>;
    readonly remove: (artifactId: string) => Effect.Effect<void, T3TeamThreadArtifactsStoreError>;
    readonly subscribe: (input: {
      readonly threadId: ThreadId;
    }) => Stream.Stream<T3TeamThreadArtifactsStreamEvent, T3TeamThreadArtifactsStoreError>;
  }
>()("t3/t3team-v2/t3team-threadArtifactsStore/T3TeamThreadArtifactsStore") {}

const ArtifactRow = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  messageId: Schema.NullOr(Schema.String),
  kind: Schema.String,
  payload: Schema.fromJsonString(Schema.Unknown),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}).pipe(Schema.decodeTo(T3TeamThreadArtifact));

const SELECT_COLUMNS = `artifact_id AS "id", thread_id AS "threadId", message_id AS "messageId",
  kind, payload_json AS "payload", created_at AS "createdAt", updated_at AS "updatedAt"`;

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const changes = yield* PubSub.unbounded<ArtifactChange>();
  const decodeArtifact = Schema.decodeUnknownEffect(T3TeamThreadArtifact);
  const encodePayload = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
  const fail = (operation: string) => (cause: unknown) =>
    new T3TeamThreadArtifactsStoreError({ operation, cause });

  const findById = SqlSchema.findAll({
    Request: Schema.String,
    Result: ArtifactRow,
    execute: (id) =>
      sql`SELECT ${sql.literal(SELECT_COLUMNS)} FROM t3team_thread_artifacts WHERE artifact_id = ${id}`,
  });
  const findByThread = SqlSchema.findAll({
    Request: Schema.String,
    Result: ArtifactRow,
    execute: (threadId) =>
      sql`SELECT ${sql.literal(SELECT_COLUMNS)} FROM t3team_thread_artifacts
          WHERE thread_id = ${threadId} ORDER BY created_at ASC, artifact_id ASC`,
  });

  const get = (artifactId: string) =>
    findById(artifactId).pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError(fail("get")),
    );

  const listByThread = (threadId: ThreadId) =>
    findByThread(threadId).pipe(Effect.mapError(fail("listByThread")));

  const upsert = (input: T3TeamThreadArtifactInput) =>
    Effect.gen(function* () {
      const nowIso = DateTime.formatIso(yield* DateTime.now);
      const result = yield* sql.withTransaction(
        Effect.gen(function* () {
          const existing = (yield* findById(input.id))[0] ?? null;
          if (existing !== null && existing.threadId !== input.threadId) {
            return yield* new T3TeamThreadArtifactsStoreError({
              operation: "upsert",
              cause: `artifact ${input.id} belongs to thread ${existing.threadId}`,
            });
          }
          const artifact = yield* decodeArtifact({
            id: input.id,
            threadId: input.threadId,
            messageId: input.messageId ?? null,
            kind: input.kind,
            payload: input.payload,
            createdAt: existing?.createdAt ?? nowIso,
            updatedAt: nowIso,
          });
          const payloadJson = yield* encodePayload(artifact.payload);
          if (
            existing !== null &&
            existing.kind === artifact.kind &&
            existing.messageId === artifact.messageId &&
            (yield* encodePayload(existing.payload)) === payloadJson
          ) {
            return { artifact: existing, changed: false };
          }
          yield* sql`
            INSERT INTO t3team_thread_artifacts
              (artifact_id, thread_id, message_id, kind, payload_json, created_at, updated_at)
            VALUES (${artifact.id}, ${artifact.threadId}, ${artifact.messageId}, ${artifact.kind},
              ${payloadJson}, ${artifact.createdAt}, ${artifact.updatedAt})
            ON CONFLICT(artifact_id) DO UPDATE SET
              message_id = excluded.message_id,
              kind = excluded.kind,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
          `;
          return { artifact, changed: true };
        }),
      );
      if (result.changed)
        yield* PubSub.publish(changes, { type: "upsert", artifact: result.artifact });
      return result.artifact;
    }).pipe(
      Effect.mapError((cause) => (isStoreError(cause) ? cause : fail("upsert")(cause))),
      Effect.withSpan("t3team.threadArtifacts.upsert"),
    );

  const remove = (artifactId: string) =>
    Effect.gen(function* () {
      const existing = yield* get(artifactId);
      if (existing === null) return;
      yield* sql`DELETE FROM t3team_thread_artifacts WHERE artifact_id = ${artifactId}`;
      yield* PubSub.publish(changes, {
        type: "removed",
        threadId: existing.threadId,
        artifactId: existing.id,
      });
    }).pipe(Effect.mapError(fail("remove")));

  const subscribe = (input: { readonly threadId: ThreadId }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        // Subscribe before the snapshot so a change between the two is buffered, not lost.
        const subscription = yield* PubSub.subscribe(changes);
        const artifacts = yield* listByThread(input.threadId);
        const live = Stream.fromSubscription(subscription).pipe(
          Stream.filter(
            (change) =>
              (change.type === "upsert" ? change.artifact.threadId : change.threadId) ===
              input.threadId,
          ),
        );
        return Stream.concat(
          Stream.succeed<T3TeamThreadArtifactsStreamEvent>({
            type: "snapshot",
            threadId: input.threadId,
            artifacts,
          }),
          live,
        );
      }),
    );

  return T3TeamThreadArtifactsStore.of({ upsert, get, listByThread, remove, subscribe });
});

export const layer = Layer.effect(T3TeamThreadArtifactsStore, make);
