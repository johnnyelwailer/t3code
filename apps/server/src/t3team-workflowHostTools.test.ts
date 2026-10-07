// @effect-diagnostics nodeBuiltinImport:off - reads workflow fixtures from a temp runs root.
/**
 * Real-path proof that a workflow BODY can reach the broker's work-item draft tools, plus the host
 * tool client's own allowlist (the bridge also carries `t3team.change_request.publish`).
 *
 * Everything below the fixture is production wiring: the real `T3TeamToolBrokerLive` (so the real
 * `publishDraft`), the real `launchWorkflowRecipe`, the real SDK capability gate. Only the thread
 * artifacts store is a recording stub — it is the seam the proposed draft is asserted on — and
 * the workflow host is a recording fake (the probe body never starts a turn).
 *
 *   1. a body declaring `mutation.draft` calls `getTools().t3team.workItem.description.draftUpdate`
 *      → the broker builds the draft AND publishes it as a `draft-mutation` artifact on the LAUNCH
 *      thread;
 *   2. the same call WITHOUT the declaration is refused by `assertToolGroupDeclared`;
 *   3. a headless run (no launch thread) gets no refs and fails the run instead of publishing.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { afterAll, describe, expect, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import * as Effect from "effect/Effect";

import type { T3TeamToolBrokerShape, T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { threadId } from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import {
  findDraftArtifact,
  makeRecordingDraftBroker,
  WORKFLOW_DRAFT_TOOL as DRAFT_TOOL,
} from "./t3team-workflowHostDraft.fixtures.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const fixturePath = (name: string): string =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));

const declaredWorkflowPath = fixturePath("t3team-hostDraftTool.workflow.ts");
const undeclaredWorkflowPath = fixturePath("t3team-hostDraftToolUndeclared.workflow.ts");
const changeRequestWorkflowPath = fixturePath("t3team-hostChangeRequestTool.workflow.ts");

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-host-tools-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-07-27T00:00:00.000Z";
const args = { issueIdOrKey: "T3-42", body: "Rewritten acceptance criteria." };

async function launch(input: {
  readonly runId: string;
  readonly workflowPath: string;
  readonly launchThreadId: string | undefined;
  readonly broker: T3TeamToolBrokerShape;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly args?: unknown;
}) {
  const hostToolClient = makeT3TeamWorkflowHostToolClient({
    broker: input.broker,
    launchThreadId: input.launchThreadId,
    ...(input.allowedToolGroups === undefined
      ? {}
      : { allowedToolGroups: input.allowedToolGroups }),
  });
  const completed: unknown[] = [];
  const errors: unknown[] = [];
  let seq = 0;
  const result = await launchWorkflowRecipe({
    runId: input.runId,
    workflowPath: input.workflowPath,
    args: input.args ?? args,
    runsRoot,
    launchThreadId: input.launchThreadId,
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    host: makeFakeWorkflowHost().host,
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
    const { broker, artifacts } = await makeRecordingDraftBroker();

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

    // The draft is published for review, and it targets the LAUNCH thread.
    const draft = findDraftArtifact(artifacts);
    expect(draft).toBeDefined();
    expect(draft?.threadId).toBe(threadId);
    expect(draft?.attachment).toMatchObject({
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

  it("honours the launching recipe's allowedToolGroups, even though the body declares the group", async () => {
    const { broker, artifacts } = await makeRecordingDraftBroker();

    // The recipe scopes itself to reads only. The body still declares `mutation.draft`, so the SDK
    // call-site gate passes — the RECIPE's scope is what must stop it.
    const { result, errors } = await launch({
      runId: "host-tool-scoped-out",
      workflowPath: declaredWorkflowPath,
      launchThreadId: threadId,
      broker,
      allowedToolGroups: ["integration.read"],
    });

    expect(result.status).toBe("failed");
    expect(String(errors[0])).toContain("requires group 'mutation.draft'");
    expect(String(errors[0])).toContain("integration.read");
    expect(findDraftArtifact(artifacts)).toBeUndefined();
  });

  it("allows the call when the recipe's allowedToolGroups include the draft group", async () => {
    const { broker, artifacts } = await makeRecordingDraftBroker();

    const { result } = await launch({
      runId: "host-tool-scoped-in",
      workflowPath: declaredWorkflowPath,
      launchThreadId: threadId,
      broker,
      allowedToolGroups: ["integration.read", "mutation.draft"],
    });

    expect(result.status).toBe("completed");
    expect(findDraftArtifact(artifacts)?.threadId).toBe(threadId);
  });

  it("refuses the same call when the body does not declare the capability", async () => {
    const { broker, artifacts } = await makeRecordingDraftBroker();

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
    expect(findDraftArtifact(artifacts)).toBeUndefined();
  });

  it("headless run: no client, and the call fails by name instead of publishing anywhere", async () => {
    const { broker, artifacts } = await makeRecordingDraftBroker();

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
    expect(findDraftArtifact(artifacts)).toBeUndefined();
  });
});

/** A broker whose binding records what it was asked and answers every call with `result`. */
function makeStubBroker(result: T3TeamToolCallResult) {
  const binds: Array<ReadonlyArray<string> | undefined> = [];
  const calls: Array<{ readonly tool: string; readonly args: unknown }> = [];
  const broker: T3TeamToolBrokerShape = {
    bindSession: (input) =>
      Effect.sync(() => {
        binds.push(input.allowedToolGroups);
        return {
          threadId: input.threadId,
          listServers: () => [],
          readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "" }] }),
          callTool: ({ tool, arguments: args }) =>
            Effect.sync(() => {
              calls.push({ tool, args });
              return result;
            }),
        };
      }),
    bindReadOnly: () => Effect.succeed(undefined),
  };
  return { broker, binds, calls };
}

/** The bridge's call function; a launch thread is always given here, so a client must exist. */
function hostCall(client: ReturnType<typeof makeT3TeamWorkflowHostToolClient>) {
  const call = client?.callHostTool;
  if (call === undefined) throw new Error("expected a thread-bound host tool client");
  return call;
}

describe("workflow host tool client", () => {
  const publishArgs = { branch: "machine/setup", paths: ["a.json"] };

  it("refuses a tool id outside the allowlist without binding the thread", async () => {
    const { broker, binds, calls } = makeStubBroker({ content: [], structuredContent: {} });
    const call = hostCall(makeT3TeamWorkflowHostToolClient({ broker, launchThreadId: threadId }));

    for (const tool of ["t3team.thread.children", "t3team.orchestration.run", "t3team.view.read"]) {
      await expect(call({ tool, args: {} })).rejects.toThrow(
        `Tool '${tool}' is not exposed to workflow bodies.`,
      );
    }
    expect(binds).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("routes change_request.publish under the recipe's groups and returns the broker's result", async () => {
    const published = { url: "https://example.test/pr/7", number: 7 };
    const { broker, binds, calls } = makeStubBroker({ content: [], structuredContent: published });
    const call = hostCall(
      makeT3TeamWorkflowHostToolClient({
        broker,
        launchThreadId: threadId,
        allowedToolGroups: ["mutation.change_request"],
      }),
    );

    const result = await call({
      tool: "t3team.change_request.publish",
      args: publishArgs,
    });

    expect(result).toEqual(published);
    expect(binds).toEqual([["mutation.change_request"]]);
    expect(calls).toEqual([{ tool: "t3team.change_request.publish", args: publishArgs }]);
  });

  it("a body declaring 'mutation.change_request' publishes via getTools().t3team.changeRequest", async () => {
    const published = { url: "https://example.test/pr/7", number: 7, projectId: "project-1" };
    const { broker, binds, calls } = makeStubBroker({ content: [], structuredContent: published });

    const { result, completed } = await launch({
      runId: "host-tool-change-request",
      workflowPath: changeRequestWorkflowPath,
      launchThreadId: threadId,
      broker,
      allowedToolGroups: ["mutation.change_request"],
      args: publishArgs,
    });

    expect(result.status).toBe("completed");
    expect(completed[0]).toEqual({ published });
    expect(binds).toEqual([["mutation.change_request"]]);
    expect(calls).toEqual([
      {
        tool: "t3team.change_request.publish",
        args: {
          ...publishArgs,
          commitMessage: "chore: add machine setup",
          title: "Add machine setup",
          body: "Adds the dev container.",
        },
      },
    ]);
  });

  it("turns a broker error result into a failed call carrying its sentence", async () => {
    const sentence = "Nothing to commit: none of the listed paths has changes.";
    const { broker } = makeStubBroker({
      content: [{ type: "text", text: sentence }],
      isError: true,
      structuredContent: { error: sentence },
    });
    const call = hostCall(makeT3TeamWorkflowHostToolClient({ broker, launchThreadId: threadId }));

    await expect(
      call({ tool: "t3team.change_request.publish", args: publishArgs }),
    ).rejects.toThrow(sentence);
  });
});
