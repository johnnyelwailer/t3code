import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { T3TeamWidgetToolCallRequest } from "@t3tools/contracts";

import { createT3TeamWidgetRegistry } from "./t3team-widgetRegistry.ts";

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);
const decode = Schema.decodeUnknownEffect(T3TeamWidgetToolCallRequest);

describe("createT3TeamWidgetRegistry", () => {
  it("evicts the oldest entry within a thread past the per-thread cap", async () => {
    const registry = createT3TeamWidgetRegistry();
    // 51 widgets on one thread; the per-thread cap is 50 → the first must be evicted.
    for (let index = 0; index < 51; index += 1) {
      await run(registry.put({ widgetId: `w-${index}`, threadId: "thread-1", tools: [] }));
    }
    assert.isUndefined(await run(registry.get("w-0")));
    assert.isDefined(await run(registry.get("w-1")));
    assert.isDefined(await run(registry.get("w-50")));
  });

  it("keeps per-thread caps independent across threads", async () => {
    const registry = createT3TeamWidgetRegistry();
    for (let index = 0; index < 50; index += 1) {
      await run(registry.put({ widgetId: `a-${index}`, threadId: "thread-a", tools: [] }));
    }
    await run(registry.put({ widgetId: "b-0", threadId: "thread-b", tools: [] }));
    // thread-a is at its cap but thread-b's single entry is untouched.
    assert.isDefined(await run(registry.get("a-49")));
    assert.isDefined(await run(registry.get("b-0")));
  });
});

describe("T3TeamWidgetToolCallRequest", () => {
  it("accepts a well-formed body", async () => {
    const decoded = await run(
      decode({ threadId: "t1", widgetId: "w1", tool: "t3team.view.read" }).pipe(Effect.result),
    );
    assert.strictEqual(decoded._tag, "Success");
  });

  it("rejects malformed bodies (missing/empty required fields) — drives the route 400", async () => {
    for (const body of [
      {},
      { threadId: "t1" },
      { threadId: "t1", widgetId: "w1" },
      { threadId: "", widgetId: "w1", tool: "x" },
      { threadId: "t1", widgetId: "w1", tool: 42 },
      "not-an-object",
    ]) {
      const decoded = await run(decode(body).pipe(Effect.result));
      assert.strictEqual(decoded._tag, "Failure", JSON.stringify(body));
    }
  });
});
