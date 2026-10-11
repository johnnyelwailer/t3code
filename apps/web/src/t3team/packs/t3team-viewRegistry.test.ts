import { describe, expect, it } from "vite-plus/test";

import { createViewRegistry, type ViewEntry } from "./t3team-viewRegistry";

const Nothing = () => null;
const summary = (id: string, packId: string): ViewEntry<never> => ({
  slot: "changeRequest.summary",
  id,
  owner: { kind: "pack", packId },
  component: Nothing,
});
const chip = (id: string): ViewEntry<never> => ({
  slot: "myWork.changeRequest",
  id,
  owner: { kind: "host" },
  component: Nothing,
});

describe("view registry", () => {
  it("keys a view by slot and id: one id may live in two slots, never twice in one", () => {
    const registry = createViewRegistry<never>();
    registry.register(summary("ci.card", "ci"));
    registry.register(chip("ci.card"));

    expect(registry.get("changeRequest.summary", "ci.card")?.slot).toBe("changeRequest.summary");
    expect(registry.get("myWork.changeRequest", "ci.card")?.slot).toBe("myWork.changeRequest");
    expect(registry.get("message.view", "ci.card")).toBeUndefined();
    expect(() => registry.register(chip("ci.card"))).toThrow(
      'View "ci.card" is already registered for slot myWork.changeRequest',
    );
  });

  it("lists one slot in registration order and an unused slot as empty", () => {
    const registry = createViewRegistry<never>();
    registry.register(summary("a.one", "a"));
    registry.register(chip("host.chip"));
    registry.register(summary("b.two", "b"));

    expect(registry.list("changeRequest.summary").map((entry) => entry.id)).toEqual([
      "a.one",
      "b.two",
    ]);
    expect(registry.list("sidecar.section")).toEqual([]);
  });
});
