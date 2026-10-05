import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { assert, it } from "./t3team-sdk.testEffect.ts";
import * as Effect from "effect/Effect";
import { withAgentStepContract } from "@runbook/threads";

import type * as LegacyModelWorkflow from "./__fixtures__/t3team-sdk.legacyModel.workflow.ts";
import { canonicalJsonStringify } from "./t3team-sdk.canonicalJson.ts";
import {
  createMockBroker,
  defineWorkflow,
  FsJournalStore,
  hashArgs,
  resumeWorkflow,
  startWorkflow,
} from "./t3team-sdk.index.ts";

const legacyModelWorkflow = defineWorkflow<typeof LegacyModelWorkflow>(
  "./__fixtures__/t3team-sdk.legacyModel.workflow.ts",
);

const withRunsRoot = <A, E>(run: (runsRoot: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      NodeFS.mkdtempSync(NodePath.join(import.meta.dirname, ".t3team-model-test-")),
    ),
    run,
    (runsRoot) => Effect.sync(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true })),
  );

it.effect("runs an unchanged body importing defineModel after the loader erases imports", () =>
  withRunsRoot((runsRoot) =>
    Effect.gen(function* () {
      const broker = createMockBroker((envelope) =>
        envelope.kind === "thread.turn"
          ? { kind: "resolve", reply: "reviewed" }
          : { kind: "defer" },
      );
      const result = yield* Effect.tryPromise(() =>
        startWorkflow(legacyModelWorkflow, undefined, { runsRoot, tools: [], broker }),
      );
      assert.isTrue("result" in result);
      if ("result" in result) assert.strictEqual(result.result, "reviewed");
      const selection = {
        provider: "primary",
        model: { kind: "model", provider: "primary", id: "model-a" },
      };
      for (const envelope of broker.sent) {
        assert.deepStrictEqual((envelope.payload as { readonly model?: unknown }).model, selection);
      }
      assert.deepStrictEqual(
        broker.sent.map((envelope) => envelope.kind),
        ["thread.create", "thread.turn"],
      );
    }),
  ),
);

it.effect("keeps legacy thread.turn args byte-identical and resumes without re-firing", () =>
  withRunsRoot((runsRoot) =>
    Effect.gen(function* () {
      const broker = createMockBroker((envelope) =>
        envelope.kind === "thread.turn"
          ? { kind: "resolve", reply: "reviewed" }
          : { kind: "defer" },
      );
      const options = { runsRoot, tools: [], broker, runId: "legacy-model-run" };
      const result = yield* Effect.tryPromise(() =>
        startWorkflow(legacyModelWorkflow, undefined, options),
      );
      const historicalArgs = {
        threadId: "legacy-model-run:1",
        prompt: withAgentStepContract("Review this change"),
        label: "Legacy review",
        model: {
          provider: "primary",
          model: { kind: "model", id: "model-a", provider: "primary" },
        },
        effort: "high",
      };
      const turn = broker.sent.find((envelope) => envelope.kind === "thread.turn");
      assert.strictEqual(JSON.stringify(turn?.payload), JSON.stringify(historicalArgs));
      assert.strictEqual(
        canonicalJsonStringify(turn?.payload),
        canonicalJsonStringify(historicalArgs),
      );
      const store = new FsJournalStore(runsRoot);
      const before = yield* Effect.tryPromise(() => store.readEntries(result.runId));
      assert.strictEqual(before.bySeq.get(2)?.argsHash, hashArgs(historicalArgs));
      const resumed = yield* Effect.tryPromise(() =>
        resumeWorkflow(result.runId, legacyModelWorkflow, undefined, options),
      );
      assert.isTrue("result" in resumed);
      if ("result" in resumed) assert.strictEqual(resumed.result, "reviewed");
      const after = yield* Effect.tryPromise(() => store.readEntries(result.runId));
      assert.deepStrictEqual([...after.bySeq.values()], [...before.bySeq.values()]);
      assert.strictEqual(broker.sent.length, 2);
    }),
  ),
);
