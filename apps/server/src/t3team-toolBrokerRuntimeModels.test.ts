/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import { describe, expect, it } from "vite-plus/test";

import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { makeBrokerLayer, threadId } from "./t3team-toolBrokerTestUtils.ts";

// The t3team.runtime.models surface/dispatch expectations live here rather than in
// t3team-toolBroker.test.ts so that file stays at its pristine size under the additive guard.
const makeOrchestrationMock = (): OrchestrationEngineShape => ({
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 1 }),
  streamDomainEvents: Stream.empty,
  latestSequence: Effect.succeed(0),
});

describe("t3team.runtime.models broker tool", () => {
  it("exposes the live provider/model catalog on the generic thread surface", async () => {
    const binding = await Effect.runPromise(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        return yield* broker.bindSession({ threadId });
      }).pipe(Effect.provide(makeBrokerLayer(makeOrchestrationMock()))),
    );

    expect(binding?.listServers()[0]?.tools).toEqual(
      expect.objectContaining({
        "t3team.runtime.models": expect.objectContaining({ name: "t3team.runtime.models" }),
      }),
    );

    const models = await Effect.runPromise(
      binding!.callTool({ server: "t3team", tool: "t3team.runtime.models" }),
    );
    expect(models.structuredContent).toMatchObject({
      source: "ProviderRegistry live snapshots",
      currentSelection: { instanceId: "codex", model: "gpt-5.4-mini" },
      providers: [],
    });
  });
});
