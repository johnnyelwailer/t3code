import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { CloudSessionService } from "./cloud/t3team-CloudSessionService.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import * as NexiBrokerService from "./cloud/t3team-NexiBrokerService.ts";
import {
  DelegateCloudSessionPlacement,
  delegateCloudSessionPlacementLayer,
  whenDelegateCloudEnabled,
} from "./t3team-delegateTaskCloudSessionLayer.ts";

const fakePlacement = delegateCloudSessionPlacementLayer.pipe(
  Layer.provide(
    Layer.mock(CloudSessionService)({
      list: Effect.succeed({ sessions: [], configured: true }),
    }),
  ),
  Layer.provide(NexiBrokerService.layerDisabled),
  Layer.provide(Layer.mock(ThreadManagementService)({})),
  Layer.provide(FetchHttpClient.layer),
);

const placementWith = (flag: string) =>
  Effect.serviceOption(DelegateCloudSessionPlacement).pipe(
    Effect.provide(
      whenDelegateCloudEnabled(fakePlacement).pipe(
        Layer.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { NEXI_FF_DELEGATE_CLOUD: flag } })),
        ),
      ),
    ),
  );

describe("T3TeamDelegateCloudSessionsLayer", () => {
  it.effect("builds nothing with the flag off", () =>
    Effect.gen(function* () {
      assert.isTrue(Option.isNone(yield* placementWith("0")));
    }),
  );

  it.effect("builds the placement with the flag on; without a broker it reports why", () =>
    Effect.gen(function* () {
      const placement = yield* placementWith("1");
      assert.isTrue(Option.isSome(placement));
      if (Option.isNone(placement)) return;
      assert.strictEqual(placement.value.capacity.limit, 3);
      const ready = yield* Effect.exit(placement.value.brokerReady);
      assert.isTrue(Exit.isFailure(ready));
      const reason = Exit.isFailure(ready)
        ? Option.getOrUndefined(Exit.findErrorOption(ready))?.reason
        : undefined;
      assert.strictEqual(reason, "broker_unavailable");
    }),
  );
});
