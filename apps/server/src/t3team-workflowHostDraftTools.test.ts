/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- The launch API is promise-shaped; the test bridges the broker layer once, like its siblings. */
// @effect-diagnostics nodeBuiltinImport:off - reads workflow fixtures from a temp runs root.
/**
 * Real-path proof that a workflow BODY can reach the broker's work-item draft tools.
 *
 * Everything below the fixture is production wiring: the real `T3TeamToolBrokerLive` (so the real
 * `publishDraft`), the real `launchWorkflowRecipe`, the real SDK capability gate. Only the
 * orchestration engine is a recording stub — it is the seam the draft carrier is asserted on.
 *
 *   1. a body declaring `mutation.draft` calls `getTools().t3team.workItem.description.draftUpdate`
 *      → the broker builds the draft AND publishes the hidden carrier to the LAUNCH thread;
 *   2. the same call WITHOUT the declaration is refused by `assertToolGroupDeclared`;
 *   3. a headless run (no launch thread) gets no refs and fails the run instead of publishing.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  type T3TeamMessageExt,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3TeamToolBroker, type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeT3TeamWorkflowHostDraftToolClient } from "./t3team-workflowHostDraftTools.ts";

const DRAFT_TOOL = "t3team.work_item.description.draft_update";
const fixturePath = (name: string): string =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));

const declaredWorkflowPath = fixturePath("t3team-hostDraftTool.workflow.ts");
const undeclaredWorkflowPath = fixturePath("t3team-hostDraftToolUndeclared.workflow.ts");

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-host-tools-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-07-27T00:00:00.000Z";
const args = { issueIdOrKey: "T3-42", body: "Rewritten acceptance criteria." };

/**
 * The real broker over a recording orchestration stub, with the launch thread's tool context
 * seeded exactly the way the web composer seeds it before a turn.
 */
async function makeBrokerWithSeededThread(): Promise<{
  readonly broker: T3TeamToolBrokerShape;
  readonly brokerDispatched: ReadonlyArray<OrchestrationCommand>;
}> {
  const brokerDispatched: OrchestrationCommand[] = [];
  const orchestrationMock: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    dispatch: (command) => {
      brokerDispatched.push(command);
      return Effect.succeed({ sequence: brokerDispatched.length });
    },
    streamDomainEvents: Stream.empty,
    latestSequence: Effect.succeed(0),
  };
  const broker = await Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* T3TeamToolBroker;
      yield* resolved.bindSession({
        threadId,
        toolContext: createThreadToolContext({
          tools: [{ id: DRAFT_TOOL, label: "Draft description", capabilities: ["write"] }],
        }),
      });
      return resolved;
    }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
  );
  return { broker, brokerDispatched };
}

function findDraftCarrier(commands: ReadonlyArray<OrchestrationCommand>) {
  for (const command of commands) {
    if (command.type !== "thread.message.upsert") continue;
    const ext: T3TeamMessageExt | undefined = command.message.t3teamExt;
    const attachment = ext?.attachments?.find((entry) => entry.kind === "draft-mutation");
    if (attachment !== undefined) return { command, ext, attachment };
  }
  return undefined;
}

async function launch(input: {
  readonly runId: string;
  readonly workflowPath: string;
  readonly launchThreadId: string | undefined;
  readonly broker: T3TeamToolBrokerShape;
}) {
  const hostToolClient = makeT3TeamWorkflowHostDraftToolClient({
    broker: input.broker,
    launchThreadId: input.launchThreadId,
  });
  const completed: unknown[] = [];
  const errors: unknown[] = [];
  let seq = 0;
  const result = await launchWorkflowRecipe({
    runId: input.runId,
    workflowPath: input.workflowPath,
    args,
    runsRoot,
    launchThreadId: input.launchThreadId,
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    dispatch: async () => undefined,
    newId: () => `${input.runId}-id-${(seq += 1)}`,
    nowIso: () => ISO,
    ...(hostToolClient === undefined ? {} : { hostToolClient }),
    onComplete: async (output) => {
      completed.push(output);
    },
    onError: async (error) => {
      errors.push(error);
    },
  });
  return { result, completed, errors, hostToolClient };
}

describe("workflow host draft tools", () => {
  it("a body declaring 'mutation.draft' reaches the broker and publishes to the launch thread", async () => {
    const { broker, brokerDispatched } = await makeBrokerWithSeededThread();

    const { result, completed } = await launch({
      runId: "host-tool-ok",
      workflowPath: declaredWorkflowPath,
      launchThreadId: threadId,
      broker,
    });

    expect(result.status).toBe("completed");
    // The body received the broker's structured result, not an error envelope.
    expect(completed[0]).toMatchObject({
      proposed: { ok: true, draftMutation: { tool: DRAFT_TOOL } },
    });

    // Blocker 2: the hidden carrier is published, and it targets the LAUNCH thread.
    const carrier = findDraftCarrier(brokerDispatched);
    expect(carrier).toBeDefined();
    expect(carrier?.command.threadId).toBe(threadId);
    expect(carrier?.ext?.visibleToUser).toBe(false);
    expect(carrier?.ext?.visibleToAgent).toBe(false);
    expect(carrier?.attachment).toMatchObject({
      kind: "draft-mutation",
      draft: {
        kind: "jira-work-item-draft",
        tool: DRAFT_TOOL,
        field: "description",
        target: { issueIdOrKey: "T3-42" },
        patch: { description: "Rewritten acceptance criteria." },
      },
    });
  });

  it("refuses the same call when the body does not declare the capability", async () => {
    const { broker, brokerDispatched } = await makeBrokerWithSeededThread();

    const { result, errors } = await launch({
      runId: "host-tool-undeclared",
      workflowPath: undeclaredWorkflowPath,
      launchThreadId: threadId,
      broker,
    });

    expect(result.status).toBe("failed");
    expect(String(errors[0])).toContain("PermissionDeniedError");
    expect(String(errors[0])).toContain("mutation.draft");
    // Nothing was proposed, so nothing reached the review surface.
    expect(findDraftCarrier(brokerDispatched)).toBeUndefined();
  });

  it("headless run: no client, and the call fails by name instead of publishing anywhere", async () => {
    const { broker, brokerDispatched } = await makeBrokerWithSeededThread();

    const { result, errors, hostToolClient } = await launch({
      runId: "host-tool-headless",
      workflowPath: declaredWorkflowPath,
      launchThreadId: undefined,
      broker,
    });

    // No launch thread → no bridge, so the run settles as `failed` (the engine's normal error
    // path) with a message naming the cause — never an undefined-member TypeError, and never a
    // draft published to some thread nobody is watching.
    expect(hostToolClient).toBeUndefined();
    expect(result.status).toBe("failed");
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("thread-bound host runtime");
    expect(String(errors[0])).not.toContain("Cannot read properties of undefined");
    expect(findDraftCarrier(brokerDispatched)).toBeUndefined();
  });
});
