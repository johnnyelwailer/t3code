import { it } from "@effect/vitest";
import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { afterEach, describe, expect } from "vite-plus/test";

import type { ProviderInstance } from "../provider/ProviderDriver.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as SourceControlProviderRegistry from "../sourceControl/SourceControlProviderRegistry.ts";
import {
  resetDistributionModelPolicy,
  setDistributionModelPolicy,
} from "../t3team-configuredDefaultModelSelection.ts";
import * as TextGeneration from "./TextGeneration.ts";

type Call = readonly [op: string, instanceId: string, model: string];

/** One provider instance whose generators record which instance and model served each call. */
const recordingInstance = (id: string, calls: Call[]): ProviderInstance => {
  const instanceId = ProviderInstanceId.make(id);
  const record = (op: string, selection: ModelSelection) =>
    Effect.sync(() => calls.push([op, id, selection.model]));
  return {
    instanceId,
    driverKind: id as unknown as ProviderInstance["driverKind"],
    continuationIdentity: {
      driverKind: id as unknown as ProviderInstance["driverKind"],
      continuationKey: `${id}:test`,
    },
    displayName: undefined,
    enabled: true,
    snapshot: {} as ProviderInstance["snapshot"],
    orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
    textGeneration: TextGeneration.TextGeneration.of({
      generateCommitMessage: (input) =>
        record("commit", input.modelSelection).pipe(Effect.as({ subject: "s", body: "" })),
      generatePrContent: (input) =>
        record("pr", input.modelSelection).pipe(Effect.as({ title: "t", body: "" })),
      generateBranchName: (input) =>
        record("branch", input.modelSelection).pipe(Effect.as({ branch: "b" })),
      generateThreadTitle: (input) =>
        record("title", input.modelSelection).pipe(Effect.as({ title: "t" })),
      generateActivityLabel: (input) =>
        record("label", input.modelSelection).pipe(Effect.as({ label: "l" })),
      generateStructured: (input) =>
        record("structured", input.modelSelection).pipe(Effect.as({ status: "ok" }) as never),
    }),
  } satisfies ProviderInstance;
};

const makeRouter = (instances: ReadonlyArray<ProviderInstance>) => {
  const byId = new Map(instances.map((instance) => [instance.instanceId, instance] as const));
  return TextGeneration.make.pipe(
    Effect.provideService(ProviderInstanceRegistry.ProviderInstanceRegistry, {
      getInstance: (id) => Effect.succeed(byId.get(id)),
      listInstances: Effect.succeed(instances),
      listUnavailable: Effect.succeed([]),
      streamChanges: Stream.empty,
      subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
        PubSub.subscribe(pubsub),
      ),
    }),
    Effect.provide(
      Layer.mock(SourceControlProviderRegistry.SourceControlProviderRegistry)({
        resolveLink: () => Effect.die("titles in this test carry their linked context"),
      }),
    ),
  );
};

/** Every generator, each asked for the caller's own selection. */
const generateAll = (router: TextGeneration.TextGeneration["Service"], selection: ModelSelection) =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    yield* router.generateCommitMessage({
      cwd,
      branch: null,
      stagedSummary: "",
      stagedPatch: "",
      modelSelection: selection,
    });
    yield* router.generatePrContent({
      cwd,
      baseBranch: "main",
      headBranch: "feature",
      commitSummary: "",
      diffSummary: "",
      diffPatch: "",
      modelSelection: selection,
    });
    yield* router.generateBranchName({ cwd, message: "m", modelSelection: selection });
    yield* router.generateThreadTitle({
      cwd,
      message: "m",
      linkedContext: "",
      modelSelection: selection,
    });
    yield* router.generateActivityLabel!({ cwd, context: "c", modelSelection: selection });
    yield* router.generateStructured!({
      cwd,
      prompt: "p",
      outputSchema: Schema.Struct({ status: Schema.String }),
      modelSelection: selection,
    });
  });

afterEach(() => resetDistributionModelPolicy());

describe("pinned text-generation model", () => {
  it.effect("routes every settings-derived generator to the pinned model", () =>
    Effect.gen(function* () {
      const calls: Call[] = [];
      const router = yield* makeRouter([
        recordingInstance("user", calls),
        recordingInstance("pinned", calls),
      ]);
      // A source-control writer model or a per-project override resolves to the caller's own
      // selection; the pin still wins.
      setDistributionModelPolicy({
        textGenerationModelSelection: { instanceId: "pinned", model: "pinned/small" },
      });
      yield* generateAll(router, createModelSelection(ProviderInstanceId.make("user"), "own"));

      expect(calls).toEqual([
        ["commit", "pinned", "pinned/small"],
        ["pr", "pinned", "pinned/small"],
        ["branch", "pinned", "pinned/small"],
        ["title", "pinned", "pinned/small"],
        ["label", "pinned", "pinned/small"],
        // Structured generation follows the workflow model policies instead.
        ["structured", "user", "own"],
      ]);
    }),
  );

  it.effect("uses the caller's selection while no pin is registered", () =>
    Effect.gen(function* () {
      const calls: Call[] = [];
      const router = yield* makeRouter([recordingInstance("user", calls)]);
      yield* generateAll(router, createModelSelection(ProviderInstanceId.make("user"), "own"));
      expect(calls.every(([, instanceId, model]) => instanceId === "user" && model === "own")).toBe(
        true,
      );
      expect(calls).toHaveLength(6);
    }),
  );
});
