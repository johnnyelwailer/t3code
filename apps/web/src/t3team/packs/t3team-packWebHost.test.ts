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

    const entry = registry.get("message.view", "standup.notes");
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
    expect(registry.list("message.view")).toEqual([]);
  });

  it("registers nothing from a pack whose module fails part-way", () => {
    const registry = createViewRegistry<PackViewContext>();
    registry.register({
      slot: "message.view",
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
    expect(registry.has("message.view", "standup.notes")).toBe(false);
  });
});

describe("activatePackWebModule slots", () => {
  const widget = {
    id: "burndown.card",
    version: "1.0.0",
    title: "Burndown",
    surfaces: ["project.dashboard.myWork"],
    content: "none",
    placements: ["side", "main"],
  } as const;
  const section = {
    id: "burndown.notes",
    version: "1.0.0",
    title: "Notes",
    surfaces: ["project.dashboard.myWork"],
  } as const;
  const activate = (
    registry: ReturnType<typeof createViewRegistry<PackViewContext>>,
    register: Parameters<typeof activatePackWebModule>[1]["activate"],
  ) => activatePackWebModule(registry, { packId: "burndown", activate: register });

  it("registers the change-request slots, owned by the pack", () => {
    const registry = createViewRegistry<PackViewContext>();
    activate(registry, (context) => {
      context.registerView({
        slot: "changeRequest.summary",
        id: "burndown.summary",
        component: View,
      });
      context.registerView({ slot: "myWork.changeRequest", id: "burndown.chip", component: View });
    });

    expect(registry.get("changeRequest.summary", "burndown.summary")?.owner).toEqual({
      kind: "pack",
      packId: "burndown",
    });
    expect(registry.has("myWork.changeRequest", "burndown.chip")).toBe(true);
  });

  it("lets one pack register the same id in two slots, but not twice in one", () => {
    const registry = createViewRegistry<PackViewContext>();
    activate(registry, (context) => {
      context.registerView({ slot: "changeRequest.summary", id: "burndown.card", component: View });
      context.registerView({ slot: "myWork.changeRequest", id: "burndown.card", component: View });
    });
    expect(registry.has("myWork.changeRequest", "burndown.card")).toBe(true);

    const second = createViewRegistry<PackViewContext>();
    expect(() =>
      activate(second, (context) => {
        context.registerView({
          slot: "myWork.changeRequest",
          id: "burndown.card",
          component: View,
        });
        context.registerView({
          slot: "myWork.changeRequest",
          id: "burndown.card",
          component: View,
        });
      }),
    ).toThrow(/already registered for slot myWork.changeRequest/);
    expect(second.list("myWork.changeRequest")).toEqual([]);
  });

  it("registers a widget and a section with the definition the host places them by", () => {
    const registry = createViewRegistry<PackViewContext>();
    activate(registry, (context) => {
      context.registerView({
        slot: "dashboard.widget",
        id: widget.id,
        definition: widget,
        component: View,
      });
      context.registerView({
        slot: "sidecar.section",
        id: section.id,
        definition: section,
        component: View,
      });
    });

    expect(registry.get("dashboard.widget", widget.id)?.definition).toMatchObject({
      id: "burndown.card",
      placements: ["side", "main"],
    });
    expect(registry.get("sidecar.section", section.id)?.definition).toMatchObject({
      id: "burndown.notes",
    });
  });

  it("refuses a definition the host cannot decode, or one whose id is not the registration's", () => {
    const registry = createViewRegistry<PackViewContext>();
    expect(() =>
      activate(registry, (context) =>
        context.registerView({
          slot: "dashboard.widget",
          id: widget.id,
          definition: { ...widget, surfaces: ["no.such.surface"] },
          component: View,
        }),
      ),
    ).toThrow();
    expect(() =>
      activate(registry, (context) =>
        context.registerView({
          slot: "sidecar.section",
          id: section.id,
          definition: { ...section, id: "burndown.other" },
          component: View,
        }),
      ),
    ).toThrow(/definition with id "burndown.other"/);
    expect(registry.list("dashboard.widget")).toEqual([]);
    expect(registry.list("sidecar.section")).toEqual([]);
  });

  it("refuses a slot the host does not render", () => {
    const registry = createViewRegistry<PackViewContext>();
    expect(() =>
      activate(registry, (context) =>
        context.registerView({ slot: "nowhere", id: "burndown.x", component: View } as never),
      ),
    ).toThrow(/slot "nowhere" is not supported/);
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

    expect(registry.list("message.view").map((entry) => entry.id)).toEqual(["standup.notes"]);
    expect(logged).toHaveBeenCalledWith(
      "[t3team] pack broken web module failed to activate",
      expect.any(Error),
    );
  });
});
