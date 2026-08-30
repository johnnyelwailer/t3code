/**
 * The attacks a re-issue-on-request hook has to survive.
 *
 * Each case is a way possession of one credential could be turned into
 * possession of another, or into access that was explicitly withdrawn. They are
 * written from the holder's side: what a stale driver has, what it presents,
 * and what it must not be given back.
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
import { withdrawThreadMcpSession } from "./t3team-mcp-credentialContinuity.ts";
import { clearMcpCredentialEpoch, mcpCredentialEpoch } from "./t3team-mcp-credentialPublication.ts";
import { readPackMcpSession } from "./t3team-pack-driverMcp.ts";
import {
  mcpCredentialRecoveryFailureReason,
  reestablishMcpCredential,
} from "./t3team-mcp-credentialRecovery.ts";

const nexplore = ProviderInstanceId.make("nexplore");
const codex = ProviderInstanceId.make("codex");

/** Past the default liveness window: the record lapses, the session does not. */
const outliveTheCredential = TestClock.adjust("25 hours");

// Possession of a credential for (thread, instance A) must not yield one
// scoped to (thread, instance B). The shape that failed review asked only
// "does the thread still have *a* live credential?", found B's, and returned
// B's whole config — endpoint and bearer — to the driver still running on A.
it.effect("an instance-A driver cannot obtain instance-B's credential", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-cross-instance");

      yield* prepare(threadId, nexplore);
      const staleDriver = driverHandle(threadId, nexplore);

      // The host moves the thread to another provider instance. The old
      // session is not stopped first, so the A driver is still running.
      const onCodex = yield* prepare(threadId, codex);
      const codexHeader = onCodex?.config.authorizationHeader ?? "";
      expect(codexHeader).not.toBe(staleDriver.presentedAuthorizationHeader);

      const recovery = yield* reestablishMcpCredential(staleDriver);

      expect(recovery._tag).toBe("Unrecognized");
      // Nothing that came back carries B's bearer, and B's credential is
      // untouched — the refusal did not disturb the live session either.
      expect(JSON.stringify(recovery)).not.toContain(bare(codexHeader));
      expect((yield* registry.resolve(bare(codexHeader)))?.providerInstanceId).toBe(codex);

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// "Check the session, then mint" is not an authorisation transaction. A
// recovery that read a valid session before a stop must not mint after it —
// and re-preparing the thread afterwards must not revive the retired hook
// either, which is the variant no `readMcpProviderSession` guard can catch.
it.effect("a stop between a recovery's read and its mint does not resurrect access", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-stop-race");

      yield* prepare(threadId, nexplore);
      const driver = driverHandle(threadId, nexplore);

      // The stop lands: records gone, stored config gone, epoch advanced.
      yield* withdrawThreadMcpSession(threadId);
      expect((yield* reestablishMcpCredential(driver))._tag).toBe("Revoked");

      // The harder half. The thread is legitimately prepared again, so the
      // stored config is back and any "is there a session?" check would pass.
      // The retired hook is still refused, and still mints nothing.
      const reopened = yield* prepare(threadId, nexplore);
      const replayed = yield* reestablishMcpCredential(driver);

      expect(replayed._tag).toBe("Revoked");
      expect(yield* registry.resolve(bare(driver.presentedAuthorizationHeader))).toBe(undefined);
      // The new session's own credential is the only one alive, and it is the
      // one the host records.
      expect(
        (yield* registry.resolve(bare(reopened?.config.authorizationHeader ?? "")))?.threadId,
      ).toBe(threadId);
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(
        reopened?.config.authorizationHeader,
      );

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// The case recovery exists for: the credential lapsed but the session did not,
// and the driver is the one that noticed.
it.effect("a lapsed credential is re-established for the session that still holds it", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-reissue");

      yield* prepare(threadId, nexplore);
      const driver = driverHandle(threadId, nexplore);

      yield* outliveTheCredential;
      expect(yield* registry.resolve(bare(driver.presentedAuthorizationHeader))).toBe(undefined);

      const recovery = yield* reestablishMcpCredential(driver);
      expect(recovery._tag).toBe("Reissued");
      if (recovery._tag !== "Reissued") return;
      expect(recovery.config.authorizationHeader).not.toBe(driver.presentedAuthorizationHeader);
      expect(recovery.config.providerInstanceId).toBe(nexplore);
      // The replacement works, so the tool call proceeds instead of failing.
      expect((yield* registry.resolve(bare(recovery.config.authorizationHeader)))?.threadId).toBe(
        threadId,
      );
      // And the host now records the credential it just handed over.
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(
        recovery.config.authorizationHeader,
      );

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// What "revoke, then issue" does when two recoveries interleave, stated
// without the race: one of them mints while the thread already has a live
// credential, and the mint takes that other credential down with it. Whoever
// was using it is left holding a bearer that stopped resolving — and the
// answer they were given still said `ok`.
it.effect("a recovery never mints over a credential the thread already has", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-no-orphaning");

      yield* prepare(threadId, nexplore);
      const driver = driverHandle(threadId, nexplore);

      // Another credential for the same scope arrives — a concurrent recovery
      // that got there first. The bearer this driver holds is now dead.
      const other = yield* registry.issue({ threadId, providerInstanceId: nexplore });
      expect(yield* registry.resolve(bare(driver.presentedAuthorizationHeader))).toBe(undefined);

      const recovery = yield* reestablishMcpCredential(driver);

      expect(recovery._tag).toBe("Unrecognized");
      // The credential the other party is using survives untouched.
      expect((yield* registry.resolve(bare(other.config.authorizationHeader)))?.threadId).toBe(
        threadId,
      );

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// The same invariant under real concurrency, as a regression guard: whatever
// order the six land in, the thread ends with one credential and every answer
// that carried one carries a bearer that resolves.
it.effect("concurrent recoveries leave exactly one live credential", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-concurrent-recovery");

      yield* prepare(threadId, nexplore);
      const driver = driverHandle(threadId, nexplore);
      yield* outliveTheCredential;

      const recoveries = yield* Effect.all(
        Array.from({ length: 6 }, () => reestablishMcpCredential(driver)),
        { concurrency: "unbounded" },
      );

      let live = 0;
      for (const recovery of recoveries) {
        if (recovery._tag === "Reissued") {
          expect(yield* registry.resolve(bare(recovery.config.authorizationHeader))).toBeDefined();
          live += 1;
        } else {
          expect(recovery._tag).toBe("Unrecognized");
        }
      }
      expect(live).toBe(1);

      const stored = McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader ?? "";
      expect((yield* registry.resolve(bare(stored)))?.threadId).toBe(threadId);

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// The reuse question used to be "does the thread have *some* matching
// credential?". Two mints for one thread left both records alive, so a bearer
// the host had already replaced was reported reusable and handed straight back.
it.effect("a bearer a later mint replaced is never handed back as reusable", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-superseded");

      const first = yield* prepare(threadId, nexplore);
      const firstHeader = first?.config.authorizationHeader ?? "";
      const driver = driverHandle(threadId, nexplore);

      // A second credential arrives for the same scope. The thread still has a
      // credential that thread-and-instance matching reports as "live", while
      // the bearer the host records — the one the agent is actually sending —
      // is dead: the replacing mint took its record with it.
      //
      // No `revokeProviderSession` here on purpose. This case is about the
      // *possession* check refusing a superseded bearer; a revoke would advance
      // the thread's epoch and the epoch check would refuse first, which is a
      // different property (covered below).
      const second = yield* registry.issue({ threadId, providerInstanceId: nexplore });
      expect(second.config.authorizationHeader).not.toBe(firstHeader);
      expect(yield* registry.resolve(bare(firstHeader))).toBe(undefined);
      expect((yield* registry.resolve(bare(second.config.authorizationHeader)))?.threadId).toBe(
        threadId,
      );

      // The host's own prepare must not hand the dead bearer back...
      const reprepared = yield* prepare(threadId, nexplore);
      expect(reprepared?.config.authorizationHeader).not.toBe(firstHeader);
      expect(
        (yield* registry.resolve(bare(reprepared?.config.authorizationHeader ?? "")))?.threadId,
      ).toBe(threadId);

      // ...and the driver still holding it gets nothing for it.
      const recovery = yield* reestablishMcpCredential(driver);
      expect(recovery._tag).toBe("Unrecognized");
      expect(yield* registry.resolve(bare(firstHeader))).toBe(undefined);

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// A revoke that deletes nothing still has to retire the thread's authority.
// The record expires long before the session does, and the host config and the
// driver's recovery closure both outlive it — so a revoke arriving after the
// expiry found no record, bumped no counter, and left the driver's stamped
// epoch still matching. With no live same-scope record to trip the anti-orphan
// branch either, the Bearer path ran to `Issued`: a working credential minted
// out of a revocation.
it.effect("a revoke after the record expired still retires the thread's authority", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-revoke-after-expiry");

      const prepared = yield* prepare(threadId, nexplore);
      const driver = driverHandle(threadId, nexplore);

      yield* outliveTheCredential;
      expect(yield* registry.resolve(bare(driver.presentedAuthorizationHeader))).toBe(undefined);
      // Nothing clears these on expiry; that is the whole setup.
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(
        driver.presentedAuthorizationHeader,
      );

      const epoch = yield* registry.withdrawalCount(threadId);
      yield* registry.revokeProviderSession(prepared?.config.providerSessionId ?? "", threadId);
      expect(yield* registry.withdrawalCount(threadId)).toBe(epoch + 1n);

      const recovery = yield* reestablishMcpCredential(driver);
      expect(recovery._tag).toBe("Revoked");
      // And nothing was minted on the way to refusing.
      expect(McpProviderSession.readMcpProviderSession(threadId)?.authorizationHeader).toBe(
        driver.presentedAuthorizationHeader,
      );

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

it.effect("a thread the host owns still refuses a bearer it never issued", () =>
  serverProcess(
    Effect.gen(function* () {
      const registry = yield* McpSessionRegistry.McpSessionRegistry;
      const threadId = ThreadId.make("thread-guessed");

      // Nothing prepared: nothing to re-establish, whatever is presented.
      const revoked = yield* reestablishMcpCredential({
        threadId,
        providerInstanceId: nexplore,
        presentedAuthorizationHeader: "Bearer attacker-supplied",
        credentialEpoch: 0n,
      });
      expect(revoked._tag).toBe("Revoked");
      if (revoked._tag === "Revoked") {
        expect(mcpCredentialRecoveryFailureReason(revoked)).toContain(
          "no longer has an MCP session",
        );
      }

      // A live thread refuses a guessed bearer, mints nothing for it, and does
      // not disturb the credential it does have.
      const live = yield* prepare(threadId, nexplore);
      const unrecognized = yield* reestablishMcpCredential({
        threadId,
        providerInstanceId: nexplore,
        presentedAuthorizationHeader: "Bearer attacker-supplied",
        credentialEpoch: mcpCredentialEpoch(threadId) ?? 0n,
      });
      expect(unrecognized._tag).toBe("Unrecognized");
      if (unrecognized._tag === "Unrecognized") {
        expect(mcpCredentialRecoveryFailureReason(unrecognized)).toContain(
          "not the one this server issued",
        );
      }
      expect(
        (yield* registry.resolve(bare(live?.config.authorizationHeader ?? "")))?.threadId,
      ).toBe(threadId);

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

// The hook is a capability, and it is only granted alongside the epoch that
// bounds it. A config the host has no issuing record for — anything that put
// it there other than a prepare — carries no way to ask for a new credential.
it.effect("hands out no recovery hook for a session the host has no epoch for", () =>
  serverProcess(
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread-no-epoch");
      const prepared = yield* prepare(threadId, nexplore);
      expect(typeof readPackMcpSession(threadId).mcp?.reestablish).toBe("function");

      // Same stored config, no recorded epoch.
      clearMcpCredentialEpoch(threadId);
      const withoutEpoch = readPackMcpSession(threadId);
      expect(withoutEpoch.mcp?.authorizationHeader).toBe(prepared?.config.authorizationHeader);
      expect(withoutEpoch.mcp?.reestablish).toBeUndefined();

      McpProviderSession.clearMcpProviderSession(threadId);
    }),
  ),
);

it.effect("without a mounted registry nothing is issued and the reason says so", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread-unavailable");
    const prepared = yield* serverProcess(prepare(threadId, nexplore));

    const recovery = yield* reestablishMcpCredential({
      threadId,
      providerInstanceId: nexplore,
      presentedAuthorizationHeader: prepared?.config.authorizationHeader ?? "",
      credentialEpoch: mcpCredentialEpoch(threadId) ?? 0n,
    });
    expect(recovery._tag).toBe("Unavailable");
    if (recovery._tag === "Unavailable") {
      expect(mcpCredentialRecoveryFailureReason(recovery)).toContain("registry is not running");
    }
    McpProviderSession.clearMcpProviderSession(threadId);
  }),
);
