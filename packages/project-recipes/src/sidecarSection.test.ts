/* oxlint-disable t3code/no-inline-schema-compile -- Existing merged lint debt; keep green while preserving behavior. */
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { SidecarSectionDefinition, defineSidecarSection } from "./sidecarSection.js";

describe("defineSidecarSection", () => {
  it("returns a validated section definition for a well-formed section", () => {
    expect(
      defineSidecarSection({
        id: "quick-starts",
        version: "1.0.0",
        title: "Quick starts",
        shortDescription: "Recipes matched to the active surface.",
        surfaces: ["project.dashboard.backlog", "workitem.detail.sidepanel"],
        component: "quick-starts",
        allowedToolGroups: ["view.state", "thread.handoff"],
        defaults: {
          collapsed: false,
          visible: true,
        },
      }),
    ).toEqual({
      id: "quick-starts",
      version: "1.0.0",
      title: "Quick starts",
      shortDescription: "Recipes matched to the active surface.",
      surfaces: ["project.dashboard.backlog", "workitem.detail.sidepanel"],
      component: "quick-starts",
      allowedToolGroups: ["view.state", "thread.handoff"],
      defaults: {
        collapsed: false,
        visible: true,
      },
    });
  });

  it("attaches item and section action contributors without widening the serializable core", () => {
    const itemActions = (item: unknown) => [
      {
        id: "pin-recipe",
        label: `Pin ${(item as { id: string }).id}`,
        run: {
          kind: "tool" as const,
          toolName: "t3work.backlog.set_assignee_filter",
          input: { mode: "current-user" },
        },
      },
    ];
    const sectionActions = () => [
      {
        id: "refresh",
        label: "Refresh",
        run: {
          kind: "script" as const,
          module: "./refresh.ts",
          input: { immediate: true },
        },
      },
    ];

    const definition = defineSidecarSection({
      id: "quick-starts",
      version: "1.0.0",
      title: "Quick starts",
      shortDescription: "Recipes matched to the active surface.",
      surfaces: ["project.dashboard.backlog", "workitem.detail.sidepanel"],
      component: "quick-starts",
      allowedToolGroups: ["view.state", "thread.handoff"],
      defaults: {
        collapsed: false,
        visible: true,
      },
      itemActions,
      sectionActions,
    });

    expect(definition.itemActions).toBe(itemActions);
    expect(definition.sectionActions).toBe(sectionActions);
    expect(definition.itemActions?.({ id: "recipe-1" })).toEqual([
      {
        id: "pin-recipe",
        label: "Pin recipe-1",
        run: {
          kind: "tool",
          toolName: "t3work.backlog.set_assignee_filter",
          input: { mode: "current-user" },
        },
      },
    ]);
    expect(definition.sectionActions?.()).toEqual([
      {
        id: "refresh",
        label: "Refresh",
        run: {
          kind: "script",
          module: "./refresh.ts",
          input: { immediate: true },
        },
      },
    ]);

    const serialized = JSON.parse(JSON.stringify(definition));
    expect(Schema.decodeSync(SidecarSectionDefinition)(serialized)).toEqual({
      id: "quick-starts",
      version: "1.0.0",
      title: "Quick starts",
      shortDescription: "Recipes matched to the active surface.",
      surfaces: ["project.dashboard.backlog", "workitem.detail.sidepanel"],
      component: "quick-starts",
      allowedToolGroups: ["view.state", "thread.handoff"],
      defaults: {
        collapsed: false,
        visible: true,
      },
    });
  });

  it("rejects malformed section definitions", () => {
    expect(() =>
      defineSidecarSection({
        id: "quick-starts",
        version: "1.0.0",
        title: 42 as never,
        surfaces: ["project.dashboard.backlog"],
        component: "quick-starts",
      }),
    ).toThrow();
  });
});
