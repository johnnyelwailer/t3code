/**
 * Settle guard hook consulted by `OrchestratorV2` when it plans a
 * `thread.settle` (including automatic settlement, which re-enters as
 * `thread.settle`). A guard returns a human-readable reason to reject the
 * settle, or `null` to allow it. The default allows everything, so upstream
 * behaviour is unchanged until a fork layer provides an override.
 *
 * Guards run inside the orchestrator's dispatch under the thread's lock: they
 * must be read-only and fast, and must never dispatch a command or take a
 * thread lock (that deadlocks). Read fork tables or `ProjectionStoreV2` only.
 *
 * Several fork features contribute checks (workflow runs, live children,
 * parent waits); compose them with `combineSettleGuards` into ONE override and
 * provide it to the V2 runtime layer in server.ts, e.g.
 * `Layer.provide(Layer.succeed(T3TeamSettleGuard, combineSettleGuards(a, b)))`.
 */
import type { CommandId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export interface T3TeamSettleGuardInput {
  readonly threadId: ThreadId;
  readonly commandId: CommandId;
  /** `server` for server-originated settles (`server:` command ids, e.g. auto-settle). */
  readonly origin: "user" | "server";
}

export type T3TeamSettleGuardCheck = (
  input: T3TeamSettleGuardInput,
) => Effect.Effect<string | null>;

export class T3TeamSettleGuard extends Context.Reference<{
  readonly check: T3TeamSettleGuardCheck;
}>("t3team/v2/SettleGuard", {
  defaultValue: () => ({ check: () => Effect.succeed(null) }),
}) {}

export const settleGuardInput = (command: {
  readonly threadId: ThreadId;
  readonly commandId: CommandId;
}): T3TeamSettleGuardInput => ({
  threadId: command.threadId,
  commandId: command.commandId,
  origin: String(command.commandId).startsWith("server:") ? "server" : "user",
});

/** Runs checks in order and returns the first rejection reason. */
export const combineSettleGuards =
  (...checks: ReadonlyArray<T3TeamSettleGuardCheck>): T3TeamSettleGuardCheck =>
  (input) =>
    Effect.gen(function* () {
      for (const check of checks) {
        const reason = yield* check(input);
        if (reason !== null) return reason;
      }
      return null;
    });
