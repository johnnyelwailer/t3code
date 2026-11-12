/**
 * Settling clears the pin, so only a user's own command (a client command id, not `mcp:` or
 * `server:`) may settle a pinned thread; agents, sweeps and auto-settle are refused.
 * @module t3team-pinnedSettleGuard
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import type { T3TeamSettleGuardCheck } from "./t3team-v2/t3team-settleGuard.ts";

/** Command-id prefixes of agent (MCP tool) and server-originated commands. */
const NON_USER_COMMAND_ID_PREFIXES = ["mcp:", "server:"] as const;

export const isUserCommandId = (commandId: string): boolean =>
  !NON_USER_COMMAND_ID_PREFIXES.some((prefix) => commandId.startsWith(prefix));

const pinnedThreadSettleRefusal = (threadId: ThreadId): string =>
  `Thread ${threadId} is pinned, so only the user can settle it. Agents and sweeps never settle it.`;

export const makePinnedSettleGuard = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const check: T3TeamSettleGuardCheck = (input) =>
    isUserCommandId(input.commandId)
      ? Effect.succeed(null)
      : sql<{ readonly pinned: number }>`SELECT 1 AS pinned
          FROM orchestration_v2_projection_threads
          WHERE thread_id = ${input.threadId}
            AND json_extract(payload_json, '$.pinnedAt') IS NOT NULL
          LIMIT 1`.pipe(
          Effect.map((rows) =>
            rows.length > 0 ? pinnedThreadSettleRefusal(input.threadId) : null,
          ),
          Effect.catchCause((cause) =>
            Effect.logWarning("t3team pinned settle guard read failed", { cause }).pipe(
              Effect.as(null),
            ),
          ),
        );
  return check;
});
