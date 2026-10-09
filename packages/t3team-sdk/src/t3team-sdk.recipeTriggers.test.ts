import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  builtinSignalSource,
  defineSignal,
  defineRecipe,
  type SignalSourceRef,
  type WorkflowRef,
} from "./t3team-sdk.index.ts";

const crUpdated = defineSignal(
  "test.recipe-trigger.cr.updated",
  Schema.Struct({ cr: Schema.String }),
);
const notEmitted = defineSignal("test.recipe-trigger.other", Schema.String);
const source = builtinSignalSource({
  name: "test.recipe-trigger.source",
  params: Schema.Struct({ projectId: Schema.String }),
  emits: [crUpdated],
});
// An author-defined source (carries `start`, no `builtin` flag): triggers must refuse it.
const authorSource = {
  kind: "signalSource",
  name: "test.recipe-trigger.author-source",
  params: Schema.Struct({ projectId: Schema.String }),
  emits: [crUpdated],
} as SignalSourceRef<unknown>;

const workflow = {
  kind: "workflow",
  path: "./trig.workflow.ts",
  absolutePath: "/abs/trig.workflow.ts",
} as WorkflowRef<{ cr?: unknown }, { summary: string }>;

const validTrigger = () => ({
  id: "viewer-cr",
  source,
  signal: crUpdated,
  select: ((payload: { readonly cr: string }) => ({ cr: payload.cr })) as never,
  key: ((payload: { readonly cr: string }) => payload.cr) as never,
  defaultEnabled: true,
});

const baseRecipe = {
  id: "recipe-trigger-test",
  version: "0.1.0",
  title: "Trigger test",
  shortDescription: "validate defineRecipe({ triggers })",
  surfaces: ["thread.context"],
  defaultAction: workflow,
};

describe("defineRecipe({ triggers }) validation", () => {
  it("keeps a valid trigger on the frozen ref, functions intact", () => {
    const trigger = validTrigger();
    const recipe = defineRecipe({ ...baseRecipe, id: "recipe-trig-ok", triggers: [trigger] });
    expect(recipe.triggers?.[0]?.id).toBe("viewer-cr");
    expect(recipe.triggers?.[0]?.source).toBe(source);
    expect(recipe.triggers?.[0]?.signal).toBe(crUpdated);
    expect(typeof recipe.triggers?.[0]?.select).toBe("function");
    expect(Object.isFrozen(recipe.triggers)).toBe(true);
    expect(Object.isFrozen(recipe.triggers?.[0])).toBe(true);
  });

  it("leaves triggers absent when none are declared (back-compat)", () => {
    const recipe = defineRecipe(baseRecipe);
    expect("triggers" in recipe).toBe(false);
  });

  it("rejects duplicate trigger ids within one recipe", () => {
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-dup",
        triggers: [validTrigger(), validTrigger()],
      }),
    ).toThrow("trigger ids must be unique");
  });

  it("rejects a trigger without a non-empty id", () => {
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-noid",
        triggers: [{ ...validTrigger(), id: "  " }],
      }),
    ).toThrow("non-empty id");
  });

  it("rejects a source that is not a built-in catalog source", () => {
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-author-source",
        triggers: [{ ...validTrigger(), source: authorSource }],
      }),
    ).toThrow("built-in signal source");
  });

  it("rejects a signal the source does not emit", () => {
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-wrong-signal",
        triggers: [{ ...validTrigger(), signal: notEmitted }],
      }),
    ).toThrow("does not emit it");
  });

  it("rejects non-function select or key", () => {
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-select",
        triggers: [{ ...validTrigger(), select: "nope" }],
      }),
    ).toThrow("select(payload, ctx)");
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-key",
        triggers: [{ ...validTrigger(), key: 42 }],
      }),
    ).toThrow("key(payload)");
  });

  it("rejects a reserved or malformed action name", () => {
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-action-default",
        triggers: [{ ...validTrigger(), action: "default" }],
      }),
    ).toThrow("not the reserved 'default'");
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-action-bad",
        triggers: [{ ...validTrigger(), action: "-leading-dash" }],
      }),
    ).toThrow("action");
  });

  it("rejects numeric limits that would not mean what they say", () => {
    const cases: Array<Record<string, unknown>> = [
      { debounceMs: -1 },
      { minIntervalMs: Number.NaN },
      { maxConcurrent: 0 },
      { maxConcurrent: 1.5 },
      { dailyCap: 0 },
    ];
    for (const overrides of cases) {
      expect(
        () =>
          defineRecipe({
            ...baseRecipe,
            id: "recipe-trig-num",
            triggers: [{ ...validTrigger(), ...overrides }],
          }),
        "limits " + JSON.stringify(overrides),
      ).toThrow();
    }
  });

  it("rejects a trigger without an explicit defaultEnabled", () => {
    const { defaultEnabled: _drop, ...rest } = validTrigger();
    expect(() =>
      defineRecipe({
        ...baseRecipe,
        id: "recipe-trig-enabled",
        triggers: [rest],
      }),
    ).toThrow("defaultEnabled");
  });

  it("accepts action + host limits + defaultEnabled: false", () => {
    const recipe = defineRecipe({
      ...baseRecipe,
      id: "recipe-trig-full",
      triggers: [
        {
          ...validTrigger(),
          action: "triage",
          debounceMs: 30_000,
          minIntervalMs: 60_000,
          maxConcurrent: 2,
          dailyCap: 24,
          defaultEnabled: false,
        },
      ],
    });
    expect(recipe.triggers?.[0]).toMatchObject({
      action: "triage",
      debounceMs: 30_000,
      minIntervalMs: 60_000,
      maxConcurrent: 2,
      dailyCap: 24,
      defaultEnabled: false,
    });
  });
});
