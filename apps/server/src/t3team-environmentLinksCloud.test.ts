import { assert, describe, it } from "@effect/vitest";
import {
  EnvironmentId,
  OrchestratorMcpEnvironmentLinksResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { type McpInvocationScope } from "./mcp/McpInvocationContext.ts";
import { PeerForwarding } from "./peer/PeerForwarding.ts";
import { cloudSession, fakeCloudSessions, signedOut } from "./t3team-delegateCloud.fixtures.ts";
import { DelegateCloudSessionPlacement } from "./t3team-delegateTaskCloudSessionLayer.ts";
import type { DelegateCloudSessions } from "./t3team-delegateTaskCloudTypes.ts";
import {
  cloudSessionRowsOf,
  layer as environmentLinksCloudLayer,
  makeListing,
} from "./t3team-environmentLinksCloud.ts";

const NOW = Date.parse("2026-11-01T12:00:00Z");

describe("cloudSessionRowsOf", () => {
  it("lists a live broker session with what delegate_task needs, and nothing internal", () => {
    const rows = cloudSessionRowsOf(
      [cloudSession({ sessionId: "7", endsAt: "2026-11-01T14:00:00Z", machineLabel: "4 cores" })],
      NOW,
    );
    assert.deepStrictEqual(rows, [
      {
        kind: "cloud",
        sessionId: "7",
        phase: "ready",
        machineLabel: "4 cores",
        repository: "nexi-machine-qa",
        endsAt: "2026-11-01T14:00:00Z",
      },
    ]);
  });

  it("keeps sessions still starting, drops ended ones, past holds and non-broker sessions", () => {
    const rows = cloudSessionRowsOf(
      [
        cloudSession({ sessionId: "starting", phase: "starting", environmentId: undefined }),
        cloudSession({ sessionId: "failed", phase: "failed" }),
        cloudSession({ sessionId: "stopped", phase: "stopped" }),
        cloudSession({ sessionId: "cancelled", phase: "cancelled" }),
        cloudSession({ sessionId: "expired", endsAt: "2026-11-01T11:59:59Z" }),
        cloudSession({ sessionId: "relay", transport: "t3_connect" }),
        cloudSession({ sessionId: "live", endsAt: "2026-11-01T12:00:01Z" }),
      ],
      NOW,
    );
    assert.deepStrictEqual(
      rows.map((row) => row.sessionId),
      ["starting", "live"],
    );
  });
});

describe("makeListing", () => {
  it.effect("an ended session is not listed once its hold has passed", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW);
      const listing = makeListing({
        list: Effect.succeed({
          configured: true,
          sessions: [cloudSession({ sessionId: "1", endsAt: "2026-11-01T12:30:00Z" })],
        }),
      });
      assert.deepStrictEqual(
        (yield* listing)?.sessions.map((row) => row.sessionId),
        ["1"],
      );
      yield* TestClock.setTime(NOW + 31 * 60_000);
      assert.deepStrictEqual((yield* listing)?.sessions, []);
    }),
  );

  it.effect("a broker that cannot be asked gives a short note, never an error", () =>
    Effect.gen(function* () {
      const listed = yield* makeListing({ list: Effect.fail(signedOut) });
      assert.deepStrictEqual(listed, {
        sessions: [],
        unavailable: "Cloud sessions not listed: broker_sign_in_required.",
      });
    }),
  );

  it.effect("a defect in the listing is a note too", () =>
    Effect.gen(function* () {
      const listed = yield* makeListing({ list: Effect.die("boom") });
      assert.strictEqual(listed?.unavailable, "Cloud sessions not listed: unexpected error.");
    }),
  );

  it.effect("a server with no provider configured says so", () =>
    Effect.gen(function* () {
      const listed = yield* makeListing({
        list: Effect.succeed({ configured: false, sessions: [] }),
      });
      assert.strictEqual(listed?.unavailable, "Cloud sessions not listed: not set up here.");
    }),
  );
});

const encodeLinks = Schema.encodeEffect(OrchestratorMcpEnvironmentLinksResult);
const decodeLinks = Schema.decodeEffect(OrchestratorMcpEnvironmentLinksResult);
const environmentId = EnvironmentId.make("environment-laptop");
const baseResult = {
  environmentId,
  links: [],
  notListed: "Not listed: not linked yet.",
} satisfies OrchestratorMcpEnvironmentLinksResult;
const scope = {} as McpInvocationScope;

/**
 * `server.ts`'s composition: the decorating layer provided with the placement (or without it, flag
 * off) and merged over the base `PeerForwarding` the consumers would otherwise get.
 */
const linksWith = (
  placement: Layer.Layer<DelegateCloudSessionPlacement> | undefined,
  base: PeerForwarding["Service"]["links"],
) =>
  Effect.gen(function* () {
    const forwarding = yield* PeerForwarding;
    return yield* forwarding.links(scope);
  }).pipe(
    Effect.provide(
      environmentLinksCloudLayer.pipe(
        Layer.provide(placement ?? Layer.empty),
        Layer.provideMerge(Layer.mock(PeerForwarding)({ links: base })),
      ),
    ),
  );

const placementOf = (list: DelegateCloudSessions["list"]) =>
  Layer.effect(
    DelegateCloudSessionPlacement,
    Effect.map(fakeCloudSessions({ list }), ({ sessions }) => sessions),
  );

describe("environmentLinksCloudLayer", () => {
  it.effect("flag off: the result is the very same links result", () =>
    Effect.gen(function* () {
      const listed = yield* linksWith(undefined, () => Effect.succeed(baseResult));
      assert.strictEqual(listed, baseResult);
      assert.isFalse("cloudSessions" in listed);
    }),
  );

  it.effect("flag on: live cloud sessions join the links, an ended one does not", () =>
    Effect.gen(function* () {
      const listed = yield* linksWith(
        placementOf(
          Effect.succeed({
            configured: true,
            sessions: [
              cloudSession({ sessionId: "41", endsAt: "2999-01-01T00:00:00Z" }),
              cloudSession({ sessionId: "42", phase: "stopped" }),
            ],
          }),
        ),
        () => Effect.succeed(baseResult),
      );
      assert.deepStrictEqual(listed.links, []);
      assert.deepStrictEqual(listed.cloudSessions, {
        sessions: [
          {
            kind: "cloud",
            sessionId: "41",
            phase: "ready",
            machineLabel: "ubuntu",
            repository: "nexi-machine-qa",
            endsAt: "2999-01-01T00:00:00Z",
          },
        ],
      });
      // The tool's output schema carries it.
      const encoded = yield* encodeLinks(listed);
      assert.deepStrictEqual(yield* decodeLinks(encoded), listed);
    }),
  );

  it.effect("flag on, broker down: the links come back with a note, not an error", () =>
    Effect.gen(function* () {
      const listed = yield* linksWith(placementOf(Effect.fail(signedOut)), () =>
        Effect.succeed(baseResult),
      );
      assert.deepStrictEqual(listed.links, []);
      assert.deepStrictEqual(listed.cloudSessions, {
        sessions: [],
        unavailable: "Cloud sessions not listed: broker_sign_in_required.",
      });
    }),
  );

  it.effect("beta off: the links refusal stands and the broker is never asked", () =>
    Effect.gen(function* () {
      const asked = yield* Ref.make(0);
      const refusal = new OrchestratorMcpFailure({
        code: "capability_denied",
        message: "Linked environments is off.",
      });
      const exit = yield* Effect.exit(
        linksWith(
          placementOf(
            Ref.update(asked, (count) => count + 1).pipe(
              Effect.as({ configured: true, sessions: [] }),
            ),
          ),
          () => Effect.fail(refusal),
        ),
      );
      assert.isTrue(Exit.isFailure(exit));
      assert.strictEqual(yield* Ref.get(asked), 0);
    }),
  );
});
