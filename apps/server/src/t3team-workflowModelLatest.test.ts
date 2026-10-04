import { it } from "@effect/vitest";
import {
  ProviderInstanceId,
  type ModelSelection,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect } from "vite-plus/test";

import { setChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { resolveStartChildModelSelection } from "./t3team-toolBrokerStartChildProvider.ts";
import { WorkflowModelSelectionError } from "./t3team-toolBrokerStartChildProviderSlug.ts";
import {
  resolveWorkflowChildModel,
  resolveWorkflowModelCascade,
} from "./t3team-workflowChildModel.ts";
import { parseWorkflowModelOption } from "./t3team-workflowModelSelection.ts";

const model = (
  slug: string,
  flags: Partial<Pick<ServerProviderModel, "isDefault" | "isLegacy" | "capabilities">> = {},
): ServerProviderModel => ({ slug, name: slug, isCustom: false, capabilities: null, ...flags });

const provider = (instanceId: string, models: ReadonlyArray<ServerProviderModel>): ServerProvider =>
  ({ instanceId, driver: instanceId, enabled: true, installed: true, models }) as ServerProvider;

const parent: ModelSelection = {
  instanceId: ProviderInstanceId.make("instance-a"),
  model: "retired",
  options: [],
};

const current = provider("instance-a", [
  model("retired", { isDefault: true, isLegacy: true }),
  model("first-current"),
  model("declared-current", { isDefault: true }),
  model("family/precise-slug"),
]);

afterEach(() => setChildProviderCatalog(undefined));

describe("live model defaults", () => {
  it.effect("prefers the provider-declared non-legacy default over models[0] and the parent", () =>
    Effect.sync(() => {
      const result = resolveStartChildModelSelection({
        parentModelSelection: parent,
        providers: [current],
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.model).toBe("declared-current");
    }),
  );

  it.effect("fails a different instance that declares no default, listing its current models", () =>
    Effect.sync(() => {
      const result = resolveStartChildModelSelection({
        parentModelSelection: parent,
        requestedProvider: "target",
        providers: [
          provider("target", [
            model("old-default", { isDefault: true, isLegacy: true }),
            model("first-current"),
            model("later-current"),
          ]),
        ],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.reason).toBe("no_models");
        expect(result.error.choices).toEqual(["first-current", "later-current"]);
        expect(result.message).not.toContain("old-default");
      }
    }),
  );

  it.effect("inherits the current model when this instance declares no default", () =>
    Effect.sync(() => {
      const result = resolveStartChildModelSelection({
        parentModelSelection: {
          ...parent,
          model: "later-current",
        },
        providers: [provider("instance-a", [model("first-current"), model("later-current")])],
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.model).toBe("later-current");
    }),
  );

  it.effect("lists every legacy slug when another instance declares no current default", () =>
    Effect.sync(() => {
      const result = resolveStartChildModelSelection({
        parentModelSelection: parent,
        requestedProvider: "target",
        providers: [
          provider("target", [
            model("only-old-a", { isLegacy: true }),
            model("retired", { isLegacy: true, isDefault: true }),
          ]),
        ],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.choices).toEqual(["only-old-a", "retired"]);
    }),
  );

  it.effect(
    "resolves omitted workflow models and model.resolve instance rungs through the same default",
    () =>
      Effect.gen(function* () {
        setChildProviderCatalog(async () => [current]);
        const child = yield* Effect.promise(() => resolveWorkflowChildModel(parent, undefined));
        expect(child.model).toBe("declared-current");
        const cascade = yield* Effect.promise(() =>
          resolveWorkflowModelCascade(parent, [{ instanceId: "instance-a" }]),
        );
        expect(cascade.selection?.model).toBe("declared-current");
      }),
  );

  it.effect("keeps a host-injected default's policy instance while choosing its latest model", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [
        current,
        provider("policy-instance", [
          model("policy-retired", { isLegacy: true }),
          model("policy-current", { isDefault: true }),
        ]),
      ]);
      const result = yield* Effect.promise(() =>
        resolveWorkflowChildModel(
          parent,
          {
            provider: "policy-instance",
            model: { kind: "model", provider: "catalog-family", id: "policy-retired" },
          },
          undefined,
          true,
        ),
      );
      expect(result).toMatchObject({ instanceId: "policy-instance", model: "policy-current" });
    }),
  );
});

describe("plain workflow model strings", () => {
  it.effect("preserves exact instance and slug bytes while splitting only the first slash", () =>
    Effect.sync(() => {
      const cases = [
        ["Instance-A", undefined],
        ["Instance-A/Declared-Current", "Declared-Current"],
        ["Instance-A/family/precise-slug", "family/precise-slug"],
        ["Instance-A/slug/with spaces", "slug/with spaces"],
      ] as const;
      for (const [raw, model] of cases) {
        const slash = raw.indexOf("/");
        const provider = slash < 0 ? raw : raw.slice(0, slash);
        expect(parseWorkflowModelOption(raw)).toEqual({ provider, model });
      }
    }),
  );

  it.effect("accepts instance/slug and preserves slashes inside catalog model slugs", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [current]);
      const result = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, "instance-a/family/precise-slug"),
      );
      expect(result).toMatchObject({
        instanceId: "instance-a",
        model: "family/precise-slug",
      });
    }),
  );

  it.effect("accepts an instance alone and selects its latest declared model", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [current]);
      const result = yield* Effect.promise(() => resolveWorkflowChildModel(parent, "instance-a"));
      expect(result.model).toBe("declared-current");
    }),
  );

  it.effect("keeps old outer-instance and nested model-provider metadata independent", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [current]);
      const result = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, {
          provider: "instance-a",
          model: { kind: "model", provider: "catalog-family", id: "first-current" },
        }),
      );
      expect(result).toMatchObject({ instanceId: "instance-a", model: "first-current" });
    }),
  );

  it.effect("honors an explicit legacy slug from the catalog", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [current]);
      const result = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, "instance-a/retired"),
      );
      expect(result.model).toBe("retired");
    }),
  );

  it.effect("applies effort to the newly chosen model's advertised control", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [
        provider("instance-a", [
          model("retired", { isLegacy: true }),
          {
            ...model("declared-current", { isDefault: true }),
            capabilities: {
              optionDescriptors: [
                {
                  id: "thinking",
                  label: "Thinking",
                  type: "boolean",
                  currentValue: false,
                },
              ],
            },
          },
        ]),
      ]);
      const result = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, "instance-a", "high"),
      );
      expect(result.model).toBe("declared-current");
      expect(result.options).toEqual([{ id: "thinking", value: true }]);
    }),
  );
});

describe("self-fixing model errors", () => {
  it.effect("lists every instance id verbatim without truncating the choices", () =>
    Effect.gen(function* () {
      const instances = Array.from({ length: 14 }, (_, index) => `instance-${index}`);
      setChildProviderCatalog(async () =>
        instances.map((instanceId) => provider(instanceId, [model("current")])),
      );
      const error = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, "unknown/current").catch((failure: unknown) => failure),
      );
      expect(error).toBeInstanceOf(WorkflowModelSelectionError);
      expect(error).toMatchObject({ reason: "unknown_instance", choices: instances });
      for (const instanceId of instances)
        expect((error as Error).message).toContain(`'${instanceId}'`);
    }),
  );

  it.effect("lists non-legacy exact slugs with the declared default first", () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [current]);
      const error = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, "instance-a/precise slug").catch(
          (failure: unknown) => failure,
        ),
      );
      expect(error).toBeInstanceOf(WorkflowModelSelectionError);
      expect(error).toMatchObject({
        _tag: "WorkflowModelSelectionError",
        reason: "unknown_model",
        choices: ["declared-current", "first-current", "family/precise-slug"],
      });
      expect((error as Error).message).toContain(
        "Valid models: 'declared-current', 'first-current', 'family/precise-slug'.",
      );
      expect((error as Error).message).not.toContain("'retired'");
    }),
  );

  it.effect("requires a live registry to select an instance's latest model", () =>
    Effect.gen(function* () {
      const error = yield* Effect.promise(() =>
        resolveWorkflowChildModel(parent, "instance-a").catch((failure: unknown) => failure),
      );
      expect(error).toBeInstanceOf(WorkflowModelSelectionError);
      expect(error).toMatchObject({ reason: "registry_unavailable" });
      expect((error as Error).message).toContain("instance-a/<exact-slug>");
    }),
  );
});
