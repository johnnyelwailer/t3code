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

import { afterAll, describe, expect, it } from "vite-plus/test";
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
  provider: "github",
  branch: "machine/setup",
  commit: "abc1234",
  projectId: ProjectId.make("project-1"),
} as const;

/** The real broker over V2 fakes with a recording publisher. `contextTools` seeds the launch
 * thread's synced context (what a web client would have written); `undefined` = never synced. */
async function makeBroker(contextTools: ReadonlyArray<string> | undefined) {
  const publishCalls: ChangeRequestPublishInput[] = [];
  const broker = await Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* T3TeamToolBroker;
      if (contextTools !== undefined) {
        yield* resolved.bindSession({
          threadId,
          toolContext: createThreadToolContext({
            tools: contextTools.map((id) => ({ id, label: id, capabilities: ["read" as const] })),
          }),
        });
      }
      return resolved;
    }).pipe(
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
    ),
  );
  return { broker, publishCalls };
}

async function runBody(input: {
  readonly runId: string;
  readonly broker: T3TeamToolBrokerShape;
  readonly allowedToolGroups: ReadonlyArray<string>;
}) {
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
    projectId: ProjectId.make("project-1"),
    modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    host: makeFakeWorkflowHost().host,
    newId: () => `${input.runId}-id-${(seq += 1)}`,
    nowIso: () => "2026-07-27T00:00:00.000Z",
    ...(hostToolClient === undefined ? {} : { hostToolClient }),
    onComplete: async (output) => {
      completed.push(output);
    },
    onError: async (error) => {
      errors.push(error);
    },
  });
  return { result, completed, errors };
}

/** What an agent turn on the launch thread sees: a plain binding, no run grant. */
async function agentTurnPublish(broker: T3TeamToolBrokerShape, groups?: ReadonlyArray<string>) {
  const binding = await Effect.runPromise(
    broker.bindSession({
      threadId,
      ...(groups === undefined ? {} : { allowedToolGroups: groups }),
    }),
  );
  if (binding === undefined) throw new Error("expected a binding");
  return await Effect.runPromise(
    binding.callTool({ server: "t3team", tool: PUBLISH, arguments: {}, threadId }),
  );
}

describe("a server-launched run calling the host tools its grant names", () => {
  // A cloud session's first message: nothing synced yet. And a thread whose synced context is the
  // `thread`-surface defaults, which never carry the opt-in publish tool.
  const threads = [
    ["a thread whose tool context was never synced", undefined],
    ["a thread synced without the tool", ["t3team.thread.children"]],
  ] as const;

  for (const [label, contextTools] of threads) {
    it(`reaches the publisher on ${label}`, async () => {
      const { broker, publishCalls } = await makeBroker(contextTools);

      const { result, completed, errors } = await runBody({
        runId: `server-launch-granted-${label.length}`,
        broker,
        allowedToolGroups: ["mutation.change_request"],
      });

      expect(errors).toEqual([]);
      expect(result.status).toBe("completed");
      expect(completed[0]).toMatchObject({ published: { url: published.url, number: 7 } });
      // Bound to the launch thread's checkout, with the body's own arguments.
      expect(publishCalls).toHaveLength(1);
      expect(publishCalls[0]).toMatchObject({
        cwd: "/workspace/project-1",
        projectId: "project-1",
        branch: "machine/setup",
        paths: ["a.json"],
      });
    });

    it(`gets no widening on ${label} when the recipe does not hold the group`, async () => {
      const { broker, publishCalls } = await makeBroker(contextTools);

      // The body declares `mutation.change_request`, so the SDK gate passes; the RECIPE lacks it.
      for (const groups of [["integration.read"], [], ["mutation.draft"]] as const) {
        const { result, errors } = await runBody({
          runId: `server-launch-ungranted-${label.length}-${groups.join("-") || "empty"}`,
          broker,
          allowedToolGroups: groups,
        });
        expect(result.status).toBe("failed");
        expect(String(errors[0])).toContain(`Tool '${PUBLISH}' is not enabled for this thread.`);
      }
      expect(publishCalls).toEqual([]);
    });
  }

  it("does not leak the widening to an agent turn on the same thread", async () => {
    const { broker, publishCalls } = await makeBroker(["t3team.thread.children"]);

    const run = await runBody({
      runId: "server-launch-leak",
      broker,
      allowedToolGroups: ["mutation.change_request"],
    });
    expect(run.result.status).toBe("completed");
    expect(publishCalls).toHaveLength(1);

    // The same thread, afterwards, as an agent turn binds it — with or without the recipe groups.
    for (const groups of [undefined, ["mutation.change_request"]] as const) {
      const turn = await agentTurnPublish(broker, groups);
      expect(turn.isError).toBe(true);
      expect(turn.content[0]?.text).toContain(`Tool '${PUBLISH}' is not enabled for this thread.`);
    }
    expect(publishCalls).toHaveLength(1);
  });
});
