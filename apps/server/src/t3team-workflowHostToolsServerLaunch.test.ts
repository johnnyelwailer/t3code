// @effect-diagnostics nodeBuiltinImport:off - reads workflow fixtures from a temp runs root.
/**
 * A run launched SERVER-side (kickoff, trigger, `orchestration.run`) must reach the host tools its
 * recipe's grant names, however the launch thread's synced tool context was built.
 *
 * Live failure this pins: the `machine-setup` recipe holds `mutation.change_request`, its body
 * called `t3team.change_request.publish`, and the run died with
 *   Tool 't3team.change_request.publish' is not enabled for this thread.
 * because nothing had synced that tool into the (cloud) launch thread's context. The web UI does
 * that union for web launches (`t3team-workflowGrantedToolIds`); a server launch never goes there.
 *
 * Production wiring throughout: the real `T3TeamToolBrokerLive` (real `bindSession`, dispatch gate,
 * change-request handler bound to the launch thread's checkout), the real host-tool client, the
 * real `launchWorkflowRecipe` and SDK capability gate. Only the publisher (git + provider) is a
 * recording fake — it is the seam the call is asserted on.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, describe, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";

import type { ChangeRequestPublishInput } from "./t3team-changeRequestPublishErrors.ts";
import { T3TeamToolBroker, type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";

const PUBLISH = "t3team.change_request.publish";
const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-hostChangeRequestTool.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-host-tools-server-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const published = {
  url: "https://example.test/pr/7",
  number: 7,
  repository: "acme/setup",
  provider: "github" as const,
  branch: "machine/setup",
  commit: "abc1234",
  projectId: ProjectId.make("project-1"),
};

const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-07-27T00:00:00.000Z";

/** A cloud session's first message: nothing synced yet. Or a thread synced without publish. */
const threadContexts = [
  { label: "a thread whose tool context was never synced", contextTools: undefined },
  { label: "a thread synced without the tool", contextTools: ["t3team.thread.children"] },
] as const;

const ungrantedCases = threadContexts.flatMap((thread) =>
  (
    [
      { groups: ["integration.read"] as const, slug: "integration.read" },
      { groups: [] as const, slug: "empty" },
      { groups: ["mutation.draft"] as const, slug: "mutation.draft" },
    ] as const
  ).map((ungranted) => ({
    label: thread.label,
    contextTools: thread.contextTools,
    groups: ungranted.groups,
    slug: ungranted.slug,
  })),
);

/** Real broker + recording publisher; optional seed of the launch thread's synced context. */
const withBroker = Effect.fn("withBroker")(function* (
  contextTools: ReadonlyArray<string> | undefined,
) {
  const publishCalls: ChangeRequestPublishInput[] = [];
  const broker = yield* T3TeamToolBroker.pipe(
    Effect.provide(
      makeBrokerLayer(undefined, {
        changeRequestPublisher: {
          publish: (input) =>
            Effect.sync(() => {
              publishCalls.push(input);
              return published;
            }),
        },
      }),
    ),
  );
  if (contextTools !== undefined) {
    yield* broker.bindSession({
      threadId,
      toolContext: createThreadToolContext({
        tools: contextTools.map((id) => ({ id, label: id, capabilities: ["read" as const] })),
      }),
    });
  }
  return { broker, publishCalls };
});

const runBody = (input: {
  readonly runId: string;
  readonly broker: T3TeamToolBrokerShape;
  readonly allowedToolGroups: ReadonlyArray<string>;
}) =>
  Effect.promise(async () => {
    const hostToolClient = makeT3TeamWorkflowHostToolClient({
      broker: input.broker,
      launchThreadId: threadId,
      allowedToolGroups: input.allowedToolGroups,
    });
    const completed: unknown[] = [];
    const errors: unknown[] = [];
    let seq = 0;
    const result = await launchWorkflowRecipe({
      runId: input.runId,
      workflowPath,
      args: { branch: "machine/setup", paths: ["a.json"] },
      runsRoot,
      launchThreadId: threadId,
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      host: makeFakeWorkflowHost().host,
      newId: () => `${input.runId}-id-${(seq += 1)}`,
      nowIso,
      ...(hostToolClient === undefined ? {} : { hostToolClient }),
      onComplete: async (output) => {
        completed.push(output);
      },
      onError: async (error) => {
        errors.push(error);
      },
    });
    return { result, completed, errors };
  });

/** What an agent turn on the launch thread sees: a plain binding, no run grant. */
const agentTurnPublish = (
  broker: T3TeamToolBrokerShape,
  groups: ReadonlyArray<string> | undefined,
) =>
  Effect.gen(function* () {
    const binding = yield* broker.bindSession({
      threadId,
      ...(groups === undefined ? {} : { allowedToolGroups: groups }),
    });
    assert.isDefined(binding);
    return yield* binding!.callTool({
      server: "t3team",
      tool: PUBLISH,
      arguments: {},
      threadId,
    });
  });

describe("a server-launched run calling the host tools its grant names", () => {
  it.effect.each(threadContexts)("reaches the publisher on $label", ({ label, contextTools }) =>
    Effect.gen(function* () {
      const { broker, publishCalls } = yield* withBroker(contextTools);

      const { result, completed, errors } = yield* runBody({
        runId: `server-launch-granted-${label.length}`,
        broker,
        allowedToolGroups: ["mutation.change_request"],
      });

      assert.deepStrictEqual(errors, []);
      assert.strictEqual(result.status, "completed");
      const output = completed[0] as { published: { url: string; number: number } };
      assert.strictEqual(output.published.url, published.url);
      assert.strictEqual(output.published.number, 7);
      assert.strictEqual(publishCalls.length, 1);
      assert.deepStrictEqual(
        {
          cwd: publishCalls[0]?.cwd,
          projectId: publishCalls[0]?.projectId,
          branch: publishCalls[0]?.branch,
          paths: publishCalls[0]?.paths,
        },
        {
          cwd: "/workspace/project-1",
          projectId: "project-1",
          branch: "machine/setup",
          paths: ["a.json"],
        },
      );
    }),
  );

  it.effect.each(ungrantedCases)(
    "gets no widening on $label when the recipe holds $slug",
    ({ label, contextTools, groups, slug }) =>
      Effect.gen(function* () {
        const { broker, publishCalls } = yield* withBroker(contextTools);

        // The body declares `mutation.change_request`, so the SDK gate passes; the RECIPE lacks it.
        const { result, errors } = yield* runBody({
          runId: `server-launch-ungranted-${label.length}-${slug}`,
          broker,
          allowedToolGroups: groups,
        });
        assert.strictEqual(result.status, "failed");
        assert.include(String(errors[0]), `Tool '${PUBLISH}' is not enabled for this thread.`);
        assert.deepStrictEqual(publishCalls, []);
      }),
  );

  it.effect("does not leak the widening to an agent turn on the same thread", () =>
    Effect.gen(function* () {
      const { broker, publishCalls } = yield* withBroker(["t3team.thread.children"]);

      const run = yield* runBody({
        runId: "server-launch-leak",
        broker,
        allowedToolGroups: ["mutation.change_request"],
      });
      assert.strictEqual(run.result.status, "completed");
      assert.strictEqual(publishCalls.length, 1);

      // The same thread, afterwards, as an agent turn binds it — with or without the recipe groups.
      for (const groups of [undefined, ["mutation.change_request"]] as const) {
        const turn = yield* agentTurnPublish(broker, groups);
        assert.isTrue(turn.isError);
        assert.include(
          turn.content[0]?.text ?? "",
          `Tool '${PUBLISH}' is not enabled for this thread.`,
        );
      }
      assert.strictEqual(publishCalls.length, 1);
    }),
  );
});
