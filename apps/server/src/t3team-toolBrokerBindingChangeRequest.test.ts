/**
 * `t3team.change_request.publish` through the real thread binding: the thread-context and
 * recipe-group gates, argument decoding, and failures returned as error results. The publisher
 * itself is covered by `t3team-changeRequestPublisher.test.ts`.
 */
import { assert, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { T3TEAM_MCP_SERVER_NAME } from "./t3team-toolBroker.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import type {
  ChangeRequestPublishArgs,
  T3TeamChangeRequestToolHandlers,
} from "./t3team-toolBrokerBindingChangeRequest.ts";
import { createThreadToolContext, threadId } from "./t3team-toolBrokerTestUtils.ts";

const TOOL = "t3team.change_request.publish";
const args = {
  branch: "machine/setup",
  paths: [".devcontainer/devcontainer.json"],
  commitMessage: "chore: add machine setup",
  title: "Add machine setup",
  body: "Adds the dev container.",
};
const published = {
  url: "https://github.com/acme/widgets/pull/7",
  number: 7,
  repository: "acme/widgets",
  provider: "github" as const,
  branch: "machine/setup",
  commit: "abc123",
  projectId: ProjectId.make("project-1"),
};

function bind(input: {
  readonly toolIds: ReadonlyArray<string>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly publish?: T3TeamChangeRequestToolHandlers["publish"];
}) {
  const calls: Array<ChangeRequestPublishArgs> = [];
  const toolContext = createThreadToolContext({
    tools: input.toolIds.map((id) => ({ id, label: id, capabilities: ["write"] as const })),
  });
  const binding = createT3TeamThreadToolBinding({
    threadId,
    toolContext,
    availableToolIds: input.toolIds,
    allowedToolGroups: input.allowedToolGroups,
    readView: () => Effect.succeed({}),
    changeRequestTools: {
      publish: (decoded) => {
        calls.push(decoded);
        return input.publish?.(decoded) ?? Effect.succeed(published);
      },
    },
  });
  const call = (toolArgs: unknown) =>
    binding.callTool({ server: T3TEAM_MCP_SERVER_NAME, tool: TOOL, arguments: toolArgs, threadId });
  return { call, calls };
}

it.effect("publishes with the decoded arguments when the recipe grants the group", () =>
  Effect.gen(function* () {
    const { call, calls } = bind({
      toolIds: [TOOL],
      allowedToolGroups: ["mutation.change_request"],
    });
    const result = yield* call({ ...args, draft: true });
    assert.strictEqual(result.isError, undefined);
    assert.deepStrictEqual(result.structuredContent, published);
    assert.deepStrictEqual(calls, [{ ...args, draft: true }]);
  }),
);

it.effect("refuses when the recipe declares only other groups", () =>
  Effect.gen(function* () {
    const { call, calls } = bind({ toolIds: [TOOL], allowedToolGroups: ["mutation.draft"] });
    const result = yield* call(args);
    assert.strictEqual(result.isError, true);
    assert.include(result.content[0]?.text, "requires group 'mutation.change_request'");
    assert.deepStrictEqual(calls, []);
  }),
);

it.effect("refuses when the thread does not offer the tool", () =>
  Effect.gen(function* () {
    const { call, calls } = bind({ toolIds: ["t3team.thread.search"] });
    const result = yield* call(args);
    assert.strictEqual(result.isError, true);
    assert.include(result.content[0]?.text, "is not enabled for this thread");
    assert.deepStrictEqual(calls, []);
  }),
);

it.effect("answers a malformed call with the expected shape", () =>
  Effect.gen(function* () {
    const { call, calls } = bind({ toolIds: [TOOL] });
    const result = yield* call({ branch: "machine/setup", paths: "not-a-list" });
    assert.strictEqual(result.isError, true);
    assert.include(result.content[0]?.text, `${TOOL} requires {branch, paths, commitMessage`);
    assert.deepStrictEqual(calls, []);
  }),
);

it.effect("returns the publisher's sentence as an error result", () =>
  Effect.gen(function* () {
    const sentence =
      "Pushing 'machine/setup' to origin was rejected. ! [rejected] (non-fast-forward)";
    const { call } = bind({ toolIds: [TOOL], publish: () => Effect.fail(sentence) });
    const result = yield* call(args);
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.content[0]?.text, sentence);
  }),
);
