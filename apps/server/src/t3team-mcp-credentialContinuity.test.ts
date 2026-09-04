import { expect, it } from "@effect/vitest";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpProviderSession from "./mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import {
  bare,
  preparedSession as prepare,
  serverProcess,
} from "./t3team-mcp-credential.fixtures.ts";
import {
  claimThreadMcpCredential,
  withdrawThreadMcpSession,
} from "./t3team-mcp-credentialContinuity.ts";
import { mcpCredentialEpoch } from "./t3team-mcp-credentialPublication.ts";

const nexplore = ProviderInstanceId.make("nexplore");
const codex = ProviderInstanceId.make("codex");

// The incident this module exists for: a re-prepare that mints revokes the
// bearer the running agent keeps sending, and there is no channel to hand it
// the replacement, so every later `/mcp` call 401s for the thread's whole life.
it.effect("re-preparing a live thread hands back the bearer its agent already holds", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-reuse");

      const first = yield* prepare(threadId, nexplore);
      const again = yield* prepare(threadId, nexplore);

      expect(again?.config.authorizationHeader).toBe(first?.config.authorizationHeader);
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(
        first?.config.authorizationHeader,
      );
      // What the agent is actually sending still resolves after the restart.
      expect(
        (yield* registry.resolve(bare(first?.config.authorizationHeader ?? "")))?.threadId,
      ).toBe(threadId);

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// Reuse is per scope. Moving the thread to another provider instance is a new
// scope, so it mints — and the credential the old instance held stops resolving
// in the same step, never in a later one.
it.effect("switching provider instance mints a new credential and kills the old one at once", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-instance-switch");

      const onNexplore = yield* prepare(threadId, nexplore);
      const onCodex = yield* prepare(threadId, codex);

      expect(onCodex?.config.authorizationHeader).not.toBe(onNexplore?.config.authorizationHeader);
      expect(onCodex?.config.providerInstanceId).toBe(codex);
      expect(yield* registry.resolve(bare(onNexplore?.config.authorizationHeader ?? ""))).toBe(
        undefined,
      );

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

it.effect("turning agent browser access off revokes, clears and retires the thread's epoch", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-browser-off");

      const issued = yield* prepare(threadId, nexplore);
      const epoch = mcpCredentialEpoch(threadId);
      expect(typeof epoch).toBe("bigint");

      expect(yield* prepare(threadId, nexplore, false)).toBeUndefined();

      expect(yield* registry.resolve(bare(issued?.config.authorizationHeader ?? ""))).toBe(
        undefined,
      );
      expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
      expect(mcpCredentialEpoch(threadId)).toBeUndefined();
      // The withdrawal is recorded, not merely applied: that is what retires
      // every recovery hook handed out under the old epoch.
      expect(yield* registry.withdrawalCount(threadId)).toBe((epoch ?? 0n) + 1n);
    }),
  ),
);

it.effect("stopping a session withdraws it the same way", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-stopped");

      const issued = yield* prepare(threadId, nexplore);
      const epoch = mcpCredentialEpoch(threadId) ?? 0n;

      yield* withdrawThreadMcpSession(threadId);

      expect(yield* registry.resolve(bare(issued?.config.authorizationHeader ?? ""))).toBe(
        undefined,
      );
      expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
      expect(yield* registry.withdrawalCount(threadId)).toBe(epoch + 1n);
    }),
  ),
);

// The publication half of this module — that a claim which lost the race
// cannot write itself back over the winner — lives in
// `t3team-mcp-credentialPublication.test.ts`, with the driver-side twin.

it.effect("issues nothing when no registry is mounted", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread-no-registry");
    expect(yield* claimThreadMcpCredential({ threadId, providerInstanceId: nexplore })).toBe(
      undefined,
    );
    expect(McpProviderSession.readMcpProviderSession(threadId)).toBeUndefined();
  }),
);
