import { defineWebActivate } from "@t3team/pack-ui/contract";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { PackViewContext } from "./t3team-PackMessageView";
import { activatePackWebModule, activatePackWebModules } from "./t3team-packWebHost";
import { createViewRegistry } from "./t3team-viewRegistry";

const View = () => null;
const view = (id: string) =>
  ({
    slot: "message.view",
    id,
    props: Schema.Struct({ n: Schema.Number }),
    component: View,
  }) as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("activatePackWebModule", () => {
  it("registers a pack's views under its own namespace, decoding props with its schema", () => {
    const registry = createViewRegistry<PackViewContext>();
    activatePackWebModule(registry, {
      packId: "standup",
      activate: defineWebActivate((context) => {
        expect(context.packId).toBe("standup");
        context.registerView({ ...view("standup.notes"), layout: "fullBleed" });
      }),
    });

    const entry = registry.get("standup.notes");
    expect(entry).toMatchObject({
      owner: { kind: "pack", packId: "standup" },
      layout: "fullBleed",
    });
    expect(entry?.bind({ n: 1 })).toBeTypeOf("function");
    expect(entry?.bind({ n: "one" })).toBeNull();
  });

  it("refuses an id outside the pack's namespace", () => {
    const registry = createViewRegistry<PackViewContext>();
    const activate = (id: string) =>
      activatePackWebModule(registry, {
        packId: "standup",
        activate: (context) => context.registerView(view(id)),
      });

    expect(() => activate("other.notes")).toThrow(/must be "standup.<name>"/);
    expect(() => activate("standup.")).toThrow(/must be "standup.<name>"/);
    expect(() => activate("standupx.notes")).toThrow(/must be "standup.<name>"/);
    expect(registry.list()).toEqual([]);
  });

  it("registers nothing from a pack whose module fails part-way", () => {
    const registry = createViewRegistry<PackViewContext>();
    registry.register({
      id: "standup.taken",
      owner: { kind: "host" },
      placement: "row",
      layout: "lane",
      bind: () => null,
    });

    expect(() =>
      activatePackWebModule(registry, {
        packId: "standup",
        activate: (context) => {
          context.registerView(view("standup.notes"));
          context.registerView(view("standup.taken"));
        },
      }),
    ).toThrow(/already registered/);
    expect(registry.has("standup.notes")).toBe(false);
  });
});

describe("activatePackWebModules", () => {
  it("skips a broken pack and still activates the rest", () => {
    const registry = createViewRegistry<PackViewContext>();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    activatePackWebModules(registry, [
      {
        packId: "broken",
        activate: () => {
          throw new Error("boom");
        },
      },
      { packId: "standup", activate: (context) => context.registerView(view("standup.notes")) },
    ]);

    expect(registry.list().map((entry) => entry.id)).toEqual(["standup.notes"]);
    expect(logged).toHaveBeenCalledWith(
      "[t3team] pack broken web module failed to activate",
      expect.any(Error),
    );
  });
});
