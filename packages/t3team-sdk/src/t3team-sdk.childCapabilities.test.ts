/**
 * The subagent capability contract (Epic 25 §Capability gating, `docs/t3team-mvp/25-workflow-engine.md:723`).
 *
 * `capabilities` is required by the TYPE on `agent` / `spawnThread`, which is where the value of this
 * change lives — a workflow that never says what its child may do no longer compiles. These tests
 * cover the half a type cannot: that `"inherit"` resolves to the parent's own grant, that an explicit
 * list is checked against the parent AT THE SPAWN rather than mid-turn, and that the resolved grant
 * reaches the host on the `thread.create` payload instead of being dropped by the SDK.
 */

import { describe, expect, it } from "vite-plus/test";

import { resolveChildCapabilities } from "./t3team-sdk.capabilityGating.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import { createMockBroker } from "./t3team-sdk.broker.ts";
import { createThreadPrimitives } from "./t3team-sdk.threadPrimitives.ts";
import type { HandleDispatch } from "./t3team-sdk.handles.ts";

const parent = new Set(["user", "integration.read", "mutation.draft"]);

/** A dispatch stub: fires the one-way side effect and hands back a stable correlation id. */
const stubDispatch = (): HandleDispatch =>
  ({
    sendOneWay: (call: {
      readonly fire: (correlationId: string, resolver: unknown) => unknown;
    }): string => {
      call.fire("child-1", { resolve: () => {}, reject: () => {} });
      return "child-1";
    },
  }) as unknown as HandleDispatch;

describe("subagent capabilities", () => {
  it("resolves 'inherit' to the parent's own grant", () => {
    expect(
      resolveChildCapabilities({ declared: "inherit", parent, childLabel: "w" }).sort(),
    ).toEqual(["integration.read", "mutation.draft", "user"]);
  });

  it("keeps an explicit subset, in either the id-string or the typed-ref spelling", () => {
    const declared = [
      "integration.read" as const,
      { kind: "tool-group" as const, id: "mutation.draft", label: "Draft", description: "d" },
    ];
    expect(resolveChildCapabilities({ declared, parent, childLabel: "w" }).sort()).toEqual([
      "integration.read",
      "mutation.draft",
    ]);
  });

  // The point of failing here: the alternative is a child that runs, produces real work, and then
  // cannot write it anywhere — surfacing as "tool is not enabled for this thread" three turns later.
  it("refuses a child that asks beyond its parent, at the spawn", () => {
    expect(() =>
      resolveChildCapabilities({
        declared: ["integration.read", "thread.handoff"],
        parent,
        childLabel: "escalator",
      }),
    ).toThrow(PermissionDeniedError);
    expect(() =>
      resolveChildCapabilities({ declared: ["thread.handoff"], parent, childLabel: "escalator" }),
    ).toThrow(/'thread.handoff'/);
  });

  // The type is the primary gate, but a `.workflow.ts` is transpiled from disk at run time, so a
  // body written before this requirement reaches the runtime unchecked. It must read as a decision
  // the author still has to make — not as `TypeError: undefined is not iterable`.
  it("names the fix when an un-migrated body omits capabilities entirely", () => {
    const call = () =>
      resolveChildCapabilities({ declared: undefined, parent, childLabel: "legacy child" });
    expect(call).toThrow(PermissionDeniedError);
    expect(call).toThrow(/without `capabilities`, which is required/);
    expect(call).toThrow(/deliberately no default/);
  });

  it("puts the resolved grant on the thread.create payload the host reads", () => {
    const broker = createMockBroker(() => ({ kind: "defer" }));
    const primitives = createThreadPrimitives({
      dispatch: stubDispatch(),
      broker,
      capabilities: parent,
      launchThreadId: "launch",
      defaultModel: undefined,
    });

    primitives.spawnThread({ name: "writer", capabilities: ["mutation.draft"] });

    const create = broker.sent.find((event) => event.kind === "thread.create");
    expect(create?.payload).toMatchObject({ name: "writer", capabilities: ["mutation.draft"] });
  });
});
