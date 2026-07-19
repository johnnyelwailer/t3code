import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import type { PackProviderDriverDefinition, PackProviderInstance } from "@t3work/packs";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { bridgePackProviderDriver } from "./t3work-pack-driverBridge.ts";

const instance: PackProviderInstance = {
  snapshot: () => ({
    displayName: "Pack provider",
    enabled: true,
    installed: true,
    status: "ready",
    models: [{ slug: "pack/model", name: "Pack model" }],
  }),
  startSession: async (input) => ({
    threadId: input.threadId,
    status: "ready",
    runtimeMode: input.runtimeMode,
  }),
  sendTurn: async (input) => ({ threadId: input.threadId, turnId: "turn-1" }),
  interruptTurn: async () => {},
  respondToRequest: async () => {},
  respondToUserInput: async () => {},
  stopSession: async () => {},
  hasSession: async () => false,
  listSessions: async () => [],
  readThread: async (threadId) => ({ threadId, turns: [] }),
  rollbackThread: async (threadId) => ({ threadId, turns: [] }),
  textGeneration: {
    generateCommitMessage: async () => ({ subject: "Pack subject", body: "" }),
    generatePrContent: async () => ({ title: "Pack PR", body: "## Summary" }),
    generateBranchName: async () => ({ branch: "pack-branch" }),
    generateThreadTitle: async () => ({ title: "Pack title" }),
    generateStructured: async () => ({ status: "Checking pack status" }),
  },
  stopAll: async () => {},
  events: async function* () {},
  dispose: async () => {},
};

const definition: PackProviderDriverDefinition = {
  schemaVersion: 1,
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
      );
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
    }),
  );
});
