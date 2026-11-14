import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import type { PackProviderDriverDefinition, PackProviderInstance } from "@t3team/pack-api";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";

import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import { bridgePackProviderDriver } from "./t3team-pack-driverBridge.ts";

const instance: PackProviderInstance = {
  snapshot: () => ({
    displayName: "Pack provider",
    enabled: true,
    installed: true,
    status: "ready",
    models: [{ slug: "pack/model", name: "Pack model" }],
  }),
  orchestration: {
    getCapabilities: async () => ({}),
    openSession: async () => {
      throw new Error("text generation never opens a session");
    },
  },
  textGeneration: {
    generateCommitMessage: async () => ({ subject: "Pack subject", body: "" }),
    generatePrContent: async () => ({ title: "Pack PR", body: "## Summary" }),
    generateBranchName: async () => ({ branch: "pack-branch" }),
    generateThreadTitle: async () => ({ title: "Pack title" }),
    generateStructured: async () => ({ status: "Checking pack status" }),
    generateActivityLabel: async () => ({ label: "Checking status" }),
  },
  dispose: async () => {},
};

const definition: PackProviderDriverDefinition = {
  schemaVersion: 2,
  driver: "custom-pack",
  displayName: "Pack provider",
  create: async () => instance,
};

describe("pack text generation bridge", () => {
  it.effect("delegates generation to the pack-owned implementation", () =>
    Effect.gen(function* () {
      const built = yield* Effect.scoped(
        bridgePackProviderDriver(definition).create({
          instanceId: ProviderInstanceId.make("custom-pack"),
          displayName: "Pack provider",
          environment: [],
          enabled: true,
          config: {},
        }),
      ).pipe(Effect.provide(McpProviderSessions.layer));
      const result = yield* built.textGeneration.generateThreadTitle({
        cwd: "/tmp",
        message: "hello",
        modelSelection: { instanceId: ProviderInstanceId.make("custom-pack"), model: "pack/model" },
      });
      expect(result).toEqual({ title: "Pack title" });
      const structured = yield* built.textGeneration.generateStructured!({
        cwd: "/tmp",
        prompt: "Summarize status",
        outputSchema: Schema.Struct({ status: Schema.String }),
        modelSelection: { instanceId: ProviderInstanceId.make("custom-pack"), model: "pack/model" },
      });
      expect(structured).toEqual({ status: "Checking pack status" });
      const label = yield* built.textGeneration.generateActivityLabel!({
        cwd: "/tmp",
        context: "running tests",
        modelSelection: { instanceId: ProviderInstanceId.make("custom-pack"), model: "pack/model" },
      });
      expect(label).toEqual({ label: "Checking status" });
    }),
  );

  it.effect("aborts the pack's request when the structured generation is interrupted", () =>
    Effect.gen(function* () {
      let received: AbortSignal | undefined;
      let started!: () => void;
      const startedPromise = new Promise<void>((resolve) => (started = resolve));
      const hanging: PackProviderDriverDefinition = {
        ...definition,
        create: async () => ({
          ...instance,
          textGeneration: {
            ...instance.textGeneration!,
            generateStructured: (input: { readonly signal?: AbortSignal }) => {
              received = input.signal;
              started();
              return new Promise<unknown>(() => {});
            },
          },
        }),
      };
      const built = yield* Effect.scoped(
        bridgePackProviderDriver(hanging).create({
          instanceId: ProviderInstanceId.make("custom-pack"),
          displayName: "Pack provider",
          environment: [],
          enabled: true,
          config: {},
        }),
      ).pipe(Effect.provide(McpProviderSessions.layer));
      const fiber = yield* Effect.forkChild(
        built.textGeneration.generateStructured!({
          cwd: "/tmp",
          prompt: "Summarize status",
          outputSchema: Schema.Struct({ status: Schema.String }),
          modelSelection: {
            instanceId: ProviderInstanceId.make("custom-pack"),
            model: "pack/model",
          },
        }),
      );
      yield* Effect.promise(() => startedPromise);
      expect(received?.aborted).toBe(false);
      yield* Fiber.interrupt(fiber);
      expect(received?.aborted).toBe(true);
    }),
  );

  // Cold local compaction wraps generateStructured in Effect.timeout(SUMMARY_TIMEOUT)
  // (orchestration-v2/t3team-coldLocalCompactionLive.ts): at the timeout the pack's request
  // is aborted too, so it stops holding a gateway slot for a result nobody reads. Intended.
  it.live("aborts the pack's request when a caller's timeout fires", () =>
    Effect.gen(function* () {
      let received: AbortSignal | undefined;
      const hanging: PackProviderDriverDefinition = {
        ...definition,
        create: async () => ({
          ...instance,
          textGeneration: {
            ...instance.textGeneration!,
            generateStructured: (input: { readonly signal?: AbortSignal }) => {
              received = input.signal;
              return new Promise<unknown>(() => {});
            },
          },
        }),
      };
      const built = yield* Effect.scoped(
        bridgePackProviderDriver(hanging).create({
          instanceId: ProviderInstanceId.make("custom-pack"),
          displayName: "Pack provider",
          environment: [],
          enabled: true,
          config: {},
        }),
      ).pipe(Effect.provide(McpProviderSessions.layer));
      const outcome = yield* built.textGeneration.generateStructured!({
        cwd: "/tmp",
        prompt: "Summarize the transcript",
        outputSchema: Schema.Struct({ summary: Schema.String }),
        modelSelection: { instanceId: ProviderInstanceId.make("custom-pack"), model: "pack/model" },
      }).pipe(Effect.timeout("20 millis"), Effect.exit);
      expect(outcome._tag).toBe("Failure");
      expect(received?.aborted).toBe(true);
    }),
  );
});
