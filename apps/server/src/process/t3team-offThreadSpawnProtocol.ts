/**
 * Messages the off-thread spawn worker posts back to the main thread.
 *
 * @module t3team-offThreadSpawnProtocol
 */
import * as Schema from "effect/Schema";

const Id = Schema.Number;

const WorkerEventSchema = Schema.Union([
  Schema.Struct({ id: Id, type: Schema.Literal("spawned"), pid: Schema.Number }),
  Schema.Struct({ id: Id, type: Schema.Literals(["stdout", "stderr"]), chunk: Schema.Uint8Array }),
  Schema.Struct({ id: Id, type: Schema.Literals(["stdoutEnd", "stderrEnd"]) }),
  Schema.Struct({
    id: Id,
    type: Schema.Literal("error"),
    message: Schema.String,
    code: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    id: Id,
    type: Schema.Literal("exit"),
    code: Schema.NullOr(Schema.Number),
    signal: Schema.NullOr(Schema.String),
  }),
]);

export type WorkerEvent = typeof WorkerEventSchema.Type;

const isWorkerEvent = Schema.is(WorkerEventSchema);

export const decodeWorkerEvent = (message: unknown): WorkerEvent | undefined =>
  isWorkerEvent(message) ? message : undefined;
