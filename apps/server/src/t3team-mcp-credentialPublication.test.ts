/**
 * The publication race, from both sides.
 *
 * Validating the exact bearer at transaction time settles who may *hold* a
 * credential. It settles nothing about what is written down afterwards. While
 * publication was a step of its own, a claim that committed before a stop could
 * install its config after the stop and after the next claim — leaving the
 * host's session map, and every recovery hook built from it, describing a
 * credential the registry had already destroyed.
 *
 * Neither case is raced. Both drive the interleaving through the caller's own
 * seam, running the withdrawal and the winning prepare in exactly the interval
 * the old publication step sat in, so the outcome is the same every run.
 */
import { expect, it } from "@effect/vitest";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import * as McpProviderSession from "./mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import {
  bare,
  driverHandle,
  preparedSession as prepare,
  serverProcess,
} from "./t3team-mcp-credential.fixtures.ts";
import {
  claimThreadMcpCredential,
  prepareThreadMcpSession,
  withdrawThreadMcpSession,
} from "./t3team-mcp-credentialContinuity.ts";
import { mcpCredentialEpoch } from "./t3team-mcp-credentialPublication.ts";
import { reestablishMcpCredential } from "./t3team-mcp-credentialRecovery.ts";

const nexplore = ProviderInstanceId.make("nexplore");

/** Runs while the claim that just committed is suspended, and wins. */
const overtake = (threadId: ThreadId, record: (header: string) => void) =>
  withdrawThreadMcpSession(threadId).pipe(
    Effect.andThen(prepare(threadId, nexplore)),
    Effect.tap((reopened) =>
      Effect.sync(() => record(reopened?.config.authorizationHeader ?? "")),
    ),
  );

it.effect("a prepare that lost the race cannot publish itself over the winner", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-publication-race");
      let winner = "";

      const loser = yield* prepareThreadMcpSession({
        threadId,
        providerInstanceId: nexplore,
        browserAccessEnabled: Effect.succeed(true),
        claimMcpCredential: (request) =>
          claimThreadMcpCredential(request).pipe(
            Effect.tap(() => overtake(threadId, (header) => (winner = header))),
          ),
        revokeMcpCredential: McpSessionRegistry.revokeActiveMcpThread,
      });

      // The loser really did commit, and really is stale by the time it
      // returns: its bearer stopped resolving while it was suspended.
      expect(loser?.config.authorizationHeader).not.toBe(winner);
      expect(yield* registry.resolve(bare(loser?.config.authorizationHeader ?? ""))).toBe(undefined);

      // What every reader sees is the winner — the stored config and the epoch
      // alike. A stale epoch would be the worse of the two: it is what a
      // driver's recovery hook is checked against.
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(winner);
      expect((yield* registry.resolve(bare(winner)))?.threadId).toBe(threadId);
      expect(mcpCredentialEpoch(threadId)).toBe(yield* registry.withdrawalCount(threadId));

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

it.effect("a re-issue that lost the race cannot publish itself over the winner", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-recovery-publication-race");

      yield* prepare(threadId, nexplore);
      const driver = driverHandle(threadId, nexplore);
      // Past the liveness window: the record lapses, the session does not, so
      // the driver's recovery reaches a mint.
      yield* TestClock.adjust("25 hours");
      let winner = "";

      const recovery = yield* reestablishMcpCredential(driver, (request) =>
        McpSessionRegistry.claimActiveMcpCredential(request).pipe(
          Effect.tap(() => overtake(threadId, (header) => (winner = header))),
        ),
      );

      // The driver is still told it was re-issued — that was true when the
      // transaction committed — and it finds out on its next call that the
      // thread was stopped underneath it. That is a race with the user, not
      // between fibers.
      expect(recovery._tag).toBe("Reissued");
      if (recovery._tag !== "Reissued") return;
      expect(recovery.config.authorizationHeader).not.toBe(winner);
      expect(yield* registry.resolve(bare(recovery.config.authorizationHeader))).toBe(undefined);

      // What must not happen is the host being left describing that dead
      // credential to everyone else.
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(winner);
      expect(mcpCredentialEpoch(threadId)).toBe(yield* registry.withdrawalCount(threadId));

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);
