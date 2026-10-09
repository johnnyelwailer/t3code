/**
 * Fake-clock tests for the recipe-trigger launch policy (S5b) — the guarantees the spec's
 * "How it works" lists: a burst of events for one key becomes ONE launch with the newest payload,
 * `minIntervalMs` holds a key, `maxConcurrent` and `dailyCap` defer, and a failing `select`
 * drops its events without stopping the runner.
 *
 * The clock is the engine's `nowMs` port; "advancing time" is `clock.now = …`. No real timers.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  makeRecipeTriggerEngine,
  RECIPE_TRIGGER_DEFAULT_SETTINGS,
  type RecipeTriggerEnginePorts,
  type RecipeTriggerInstanceRef,
} from "./t3team-recipeTriggerRunnerCore.ts";

interface RecordedLaunch {
  readonly key: string;
  readonly args: Record<string, unknown>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function makeEngine() {
  const clock = { now: 0 };
  const claimedKeys: string[] = [];
  const launches: RecordedLaunch[] = [];

  let claimAlwaysFalse = false;
  const ports: RecipeTriggerEnginePorts = {
    nowMs: () => clock.now,
    log: () => {},
    claim: async (key) => {
      claimedKeys.push(key);
      return !claimAlwaysFalse;
    },
    launch: async (request) => {
      let resolveRef: () => void = () => {};
      let rejectRef: (error: Error) => void = () => {};
      launches.push({
        key: request.key,
        args: request.args,
        resolve: () => resolveRef(),
        reject: (error) => rejectRef(error),
      });
      await new Promise<void>((resolve, reject) => {
        resolveRef = resolve;
        rejectRef = reject;
      });
    },
  };
  const engine = makeRecipeTriggerEngine(ports);
  return {
    engine,
    clock,
    claimedKeys,
    launches,
    setClaimAlwaysFalse: () => {
      claimAlwaysFalse = true;
    },
  };
}

const instance: RecipeTriggerInstanceRef = {
  sourceName: "scm.viewer.change-requests",
  paramsHash: "hash-p",
  signalName: "scm.viewer.changeRequest.updated",
};

const baseInput = {
  projectId: "p1",
  recipeId: "recipe-a",
  triggerId: "viewer-cr",
  select: ((payload: unknown) => ({ cr: payload })) as never,
  key: ((payload: unknown) => String((payload as { readonly cr?: unknown })?.cr ?? "cr")) as never,
  settings: RECIPE_TRIGGER_DEFAULT_SETTINGS,
  selectContext: { settings: {} },
  instance,
  events: [] as Array<{
    readonly id: number;
    readonly payload: unknown;
    readonly createdAtMs: number;
  }>,
};

const processEvents = (
  engine: ReturnType<typeof makeRecipeTriggerEngine>,
  overrides: Partial<typeof baseInput> = {},
) => engine.processEvents({ ...baseInput, ...overrides } as never);

const settle = () => Effect.runPromise(Effect.sleep(0));

describe("recipe trigger launch policy", () => {
  it("collapses a burst of events for one key into ONE launch with the newest payload (trailing debounce)", async () => {
    const { engine, clock, claimedKeys, launches } = makeEngine();
    const events = [
      { id: 1, payload: { cr: "repo#1", note: "first push" }, createdAtMs: 0 },
      { id: 2, payload: { cr: "repo#1", note: "second push" }, createdAtMs: 10_000 },
    ];
    const settings = { ...RECIPE_TRIGGER_DEFAULT_SETTINGS, debounceMs: 30_000 };

    clock.now = 20_000;
    expect(await processEvents(engine, { events, settings })).toEqual({
      launched: 0,
      skipped: 0,
      deferred: 1,
      dropped: 0,
    });
    expect(claimedKeys).toHaveLength(0); // deferred: nothing is consumed yet

    clock.now = 40_000;
    expect(await processEvents(engine, { events, settings })).toEqual({
      launched: 1,
      skipped: 0,
      deferred: 0,
      dropped: 0,
    });
    expect(claimedKeys).toEqual(["repo#1"]);
    expect(launches).toHaveLength(1);
    expect(launches[0]?.args).toEqual({ cr: { cr: "repo#1", note: "second push" } });
  });

  it("holds a key under minIntervalMs from its last launch, then launches again", async () => {
    const { engine, clock, launches } = makeEngine();
    const settings = { ...RECIPE_TRIGGER_DEFAULT_SETTINGS, minIntervalMs: 100_000 };

    clock.now = 0;
    await processEvents(engine, {
      settings,
      events: [{ id: 1, payload: { cr: "repo#1" }, createdAtMs: 0 }],
    });
    launches[0]?.resolve(); // settle launch #1 so the in-flight cap is out of the picture
    await settle();

    clock.now = 50_000; // inside the interval
    expect(
      await processEvents(engine, {
        settings,
        events: [{ id: 2, payload: { cr: "repo#1" }, createdAtMs: 50_000 }],
      }),
    ).toMatchObject({ launched: 0, deferred: 1 });

    clock.now = 105_000; // past the interval
    expect(
      await processEvents(engine, {
        settings,
        events: [{ id: 3, payload: { cr: "repo#1" }, createdAtMs: 105_000 }],
      }),
    ).toMatchObject({ launched: 1, deferred: 0 });
  });

  it("queues the next key while maxConcurrent is in flight, launches it when the first settles", async () => {
    const { engine, clock, launches } = makeEngine();
    const settings = { ...RECIPE_TRIGGER_DEFAULT_SETTINGS, maxConcurrent: 1 };

    clock.now = 0;
    const result = await processEvents(engine, {
      settings,
      events: [
        { id: 1, payload: { cr: "repo#1" }, createdAtMs: 0 },
        { id: 2, payload: { cr: "repo#2" }, createdAtMs: 0 },
      ],
    });
    expect(result.launched).toBe(1); // repo#1 (oldest event first)
    expect(result.deferred).toBe(1); // repo#2 waits on the in-flight cap
    expect(engine.inFlight("recipe-a")).toBe(1);

    launches[0]?.resolve();
    await settle();
    expect(engine.inFlight("recipe-a")).toBe(0);

    clock.now = 10_000;
    expect(
      await processEvents(engine, {
        settings,
        events: [{ id: 2, payload: { cr: "repo#2" }, createdAtMs: 0 }],
      }),
    ).toMatchObject({ launched: 1 });
  });

  it("does not stop when select() throws: the faulting events are dropped, the others launch", async () => {
    const { engine, clock, launches, claimedKeys } = makeEngine();
    clock.now = 0;
    const result = await processEvents(engine, {
      settings: { ...RECIPE_TRIGGER_DEFAULT_SETTINGS, maxConcurrent: 5 },
      select: ((payload: unknown) => {
        if ((payload as { readonly cr?: string }).cr === "poison#9") throw new Error("boom");
        return { cr: (payload as { cr: string }).cr };
      }) as never,
      events: [
        { id: 1, payload: { cr: "poison#9" }, createdAtMs: 0 },
        { id: 2, payload: { cr: "good#1" }, createdAtMs: 0 },
      ],
    });
    expect(result.launched).toBe(1);
    expect(result.dropped).toBe(1);
    expect(claimedKeys).toContain("poison#9"); // consumed — no hot-loop on the poison event
    expect(launches[0]?.key).toBe("good#1");
  });

  it("skips (and consumes) a key when select() answers null", async () => {
    const { engine, clock, claimedKeys, launches } = makeEngine();
    clock.now = 0;
    const result = await processEvents(engine, {
      select: ((payload: unknown) =>
        (payload as { readonly cr?: string }).cr === "nope" ? null : { ok: true }) as never,
      events: [
        { id: 1, payload: { cr: "nope" }, createdAtMs: 0 },
        { id: 2, payload: { cr: "yes" }, createdAtMs: 0 },
      ],
    });
    expect(result).toEqual({ launched: 1, skipped: 1, deferred: 0, dropped: 0 });
    expect([...claimedKeys].sort()).toEqual(["nope", "yes"]);
    expect(launches).toHaveLength(1);
    expect(launches[0]?.key).toBe("yes");
  });

  it("respects the daily cap: with two launches in the window the third defers, then the window clears", async () => {
    const { engine, clock, launches } = makeEngine();
    const settings = {
      ...RECIPE_TRIGGER_DEFAULT_SETTINGS,
      maxConcurrent: 5,
      dailyCap: 2,
    };
    clock.now = 0;
    const result = await processEvents(engine, {
      settings,
      events: [
        { id: 1, payload: { cr: "repo#1" }, createdAtMs: 0 },
        { id: 2, payload: { cr: "repo#2" }, createdAtMs: 0 },
        { id: 3, payload: { cr: "repo#3" }, createdAtMs: 0 },
      ],
    });
    expect(result.launched).toBe(2);
    expect(result.deferred).toBe(1);
    expect(launches.map((l) => l.key).sort()).toEqual(["repo#1", "repo#2"]);

    for (const launch of launches) launch.resolve();
    await settle();
    clock.now = 60_000; // window still holds two launches
    expect(
      await processEvents(engine, {
        settings,
        events: [{ id: 3, payload: { cr: "repo#3" }, createdAtMs: 0 }],
      }),
    ).toMatchObject({ launched: 0, deferred: 1 });

    clock.now = 25 * 60 * 60 * 1000; // past the 24 h window
    expect(
      await processEvents(engine, {
        settings,
        events: [{ id: 3, payload: { cr: "repo#3" }, createdAtMs: 0 }],
      }),
    ).toMatchObject({ launched: 1 });
  });

  it("does not launch a key its claim lost (another consumer took the events first)", async () => {
    const loser = makeEngine();
    loser.setClaimAlwaysFalse();
    loser.clock.now = 1_000;
    expect(
      await loser.engine.processEvents({
        ...baseInput,
        events: [{ id: 1, payload: { cr: "repo#1" }, createdAtMs: 0 }],
      } as never),
    ).toEqual({ launched: 0, skipped: 0, deferred: 0, dropped: 0 });
    expect(loser.launches).toHaveLength(0);
  });

  it("quarantines a poison event whose key() throws, without touching the good ones", async () => {
    const { engine, clock, launches } = makeEngine();
    clock.now = 0;
    const result = await processEvents(engine, {
      key: ((payload: unknown) => {
        if ((payload as { readonly cr?: string }).cr === "poison#9") throw new Error("key boom");
        return String((payload as { cr: string }).cr);
      }) as never,
      events: [
        { id: 1, payload: { cr: "poison#9" }, createdAtMs: 0 },
        { id: 2, payload: { cr: "good#1" }, createdAtMs: 0 },
      ],
    });
    expect(result.launched).toBe(1);
    expect(result.dropped).toBe(1);
    expect(launches[0]?.key).toBe("good#1");
  });

  it("passes the host-side settings to select() as its context", async () => {
    const { engine, clock } = makeEngine();
    clock.now = 0;
    const seen: unknown[] = [];
    await processEvents(engine, {
      select: ((payload: unknown, ctx: { readonly settings: Record<string, unknown> }) => {
        seen.push(ctx.settings);
        return { cr: payload };
      }) as never,
      selectContext: { settings: { enabled: true, overrides: { maxConcurrent: 2 } } },
      events: [{ id: 1, payload: { cr: "repo#1" }, createdAtMs: 0 }],
    });
    expect(seen).toEqual([{ enabled: true, overrides: { maxConcurrent: 2 } }]);
  });

  it("launch() failures decrement the in-flight counter, so the cap frees up", async () => {
    const { engine, clock, launches } = makeEngine();
    const settings = { ...RECIPE_TRIGGER_DEFAULT_SETTINGS, maxConcurrent: 1 };
    clock.now = 0;
    await processEvents(engine, {
      settings,
      events: [
        { id: 1, payload: { cr: "repo#1" }, createdAtMs: 0 },
        { id: 2, payload: { cr: "repo#2" }, createdAtMs: 0 },
      ],
    });
    launches[0]?.reject(new Error("provider exploded"));
    await settle();
    expect(engine.inFlight("recipe-a")).toBe(0);

    clock.now = 10_000;
    expect(
      await processEvents(engine, {
        settings,
        events: [{ id: 2, payload: { cr: "repo#2" }, createdAtMs: 0 }],
      }),
    ).toMatchObject({ launched: 1 });
  });

  it("never runs more than maxConcurrent launches of a recipe at once", async () => {
    const { engine, clock } = makeEngine();
    const settings = { ...RECIPE_TRIGGER_DEFAULT_SETTINGS, maxConcurrent: 1 };
    clock.now = 0;
    for (let n = 1; n <= 4; n++) {
      await processEvents(engine, {
        settings,
        events: [{ id: n, payload: { cr: `repo#${n}` }, createdAtMs: 0 }],
      });
    }
    expect(engine.inFlight("recipe-a")).toBe(1); // exactly one in flight, the rest parked
  });
});
