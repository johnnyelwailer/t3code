/**
 * `t3team.repository_secret.set` through the real thread binding: group gates and argument decode.
 */
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { T3TEAM_MCP_SERVER_NAME } from "./t3team-toolBroker.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import type {
  RepositorySecretSetArgs,
  T3TeamRepositorySecretToolHandlers,
} from "./t3team-toolBrokerBindingRepositorySecret.ts";
import { createThreadToolContext, threadId } from "./t3team-toolBrokerTestUtils.ts";

const TOOL = "t3team.repository_secret.set";
const args = {
  name: "NPM_TOKEN",
  label: "NPM_TOKEN",
  reason: "The machine installs private packages.",
};

function bind(input: {
  readonly toolIds: ReadonlyArray<string>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly set?: T3TeamRepositorySecretToolHandlers["set"];
}) {
  const calls: Array<RepositorySecretSetArgs> = [];
  const toolContext = createThreadToolContext({
    tools: input.toolIds.map((id) => ({ id, label: id, capabilities: ["write"] as const })),
  });
  const binding = createT3TeamThreadToolBinding({
    threadId,
    toolContext,
    availableToolIds: input.toolIds,
    allowedToolGroups: input.allowedToolGroups,
    readView: () => Effect.succeed({}),
    repositorySecretTools: {
      set: (decoded) => {
        calls.push(decoded);
        return (
          input.set?.(decoded) ?? Effect.succeed({ status: "saved" as const, name: decoded.name })
        );
      },
    },
  });
  const call = (toolArgs: unknown) =>
    binding.callTool({ server: T3TEAM_MCP_SERVER_NAME, tool: TOOL, arguments: toolArgs, threadId });
  return { call, calls };
}

it.effect("sets with the decoded arguments when the recipe grants the group", () =>
  Effect.gen(function* () {
    const { call, calls } = bind({
      toolIds: [TOOL],
      allowedToolGroups: ["mutation.repository_secret"],
    });
    const result = yield* call(args);
    assert.strictEqual(result.isError, undefined);
    assert.deepStrictEqual(result.structuredContent, { status: "saved", name: "NPM_TOKEN" });
    assert.deepStrictEqual(calls, [args]);
  }),
);

it.effect("refuses when the recipe declares only other groups", () =>
  Effect.gen(function* () {
    const { call, calls } = bind({
      toolIds: [TOOL],
      allowedToolGroups: ["mutation.change_request"],
    });
    const result = yield* call(args);
    assert.strictEqual(result.isError, true);
    assert.include(result.content[0]?.text, "requires group 'mutation.repository_secret'");
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
    const result = yield* call({ name: "NPM_TOKEN" });
    assert.strictEqual(result.isError, true);
    assert.include(result.content[0]?.text, `${TOOL} requires {name, label, reason}`);
    assert.deepStrictEqual(calls, []);
  }),
);

it.effect("returns the handler's sentence as an error result", () =>
  Effect.gen(function* () {
    const sentence = "Current t3team thread was not found.";
    const { call } = bind({ toolIds: [TOOL], set: () => Effect.fail(sentence) });
    const result = yield* call(args);
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.content[0]?.text, sentence);
  }),
);
