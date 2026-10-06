import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { claimedSessions, makeClaimLedger, standbyPoolKey } from "./t3team-CloudSessionClaim.ts";

const repoRef = {
  host: "ghe.test",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};
const T0 = 1_800_000_000_000;
const phasesAt = (minutes: number, broker: Array<{ runId: string; environmentId?: string }>) =>
  Effect.gen(function* () {
    const ledger = yield* makeClaimLedger();
    yield* Ref.set(ledger, new Map([["9", { name: "api", startedAtMs: T0, seen: false }]]));
    return yield* claimedSessions({
      ledger,
      brokerSessions: broker,
      knownRunIds: new Set(),
      nowMs: T0 + minutes * 60_000,
      machineLabel: "m",
      repoRef,
    });
  });

describe("standby claims", () => {
  it("names a project's pool like its prebuilt image tags", () => {
    expect(standbyPoolKey({ owner: "Acme", name: "My_Repo" })).toBe("acme.my_repo");
  });

  it.effect("a claim is starting, then ready once the broker lists it", () =>
    Effect.gen(function* () {
      expect((yield* phasesAt(1, [])).map((s) => s.phase)).toEqual(["preparing"]);
      const ready = yield* phasesAt(1, [{ runId: "9", environmentId: "env-1" }]);
      expect(ready.map((s) => [s.phase, s.environmentId, s.transport])).toEqual([
        ["ready", "env-1", "nexi_broker"],
      ]);
    }),
  );

  it.effect("a claim that never comes up is reported failed, then forgotten", () =>
    Effect.gen(function* () {
      expect((yield* phasesAt(15, [])).map((s) => s.phase)).toEqual(["failed"]);
      expect(yield* phasesAt(61, [])).toEqual([]);
    }),
  );

  it.effect("a session that came up and then left the broker has stopped", () =>
    Effect.gen(function* () {
      const ledger = yield* makeClaimLedger();
      yield* Ref.set(ledger, new Map([["9", { name: "api", startedAtMs: T0, seen: false }]]));
      const at = (min: number, broker: Array<{ runId: string }>) =>
        claimedSessions({
          ledger,
          brokerSessions: broker,
          knownRunIds: new Set(),
          nowMs: T0 + min * 60_000,
          machineLabel: "m",
          repoRef,
        });
      yield* at(2, [{ runId: "9" }]);
      expect((yield* at(30, [])).map((s) => s.phase)).toEqual(["stopped"]);
    }),
  );
});
