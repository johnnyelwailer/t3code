import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  MACHINE_SOURCE_ACCEPT_LABEL,
  MACHINE_SOURCE_DECLINE_LABEL,
  ProjectId,
  ProjectMachineDiscoveryError,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  decodeMachineSourceQuestionId,
  machineSourceQuestionLine,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { MachineSourceProposal } from "../../../project/t3team-MachineSourceProposal.ts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  T3TeamAskUserError,
  T3TeamAskUserWriter,
  type T3TeamAskUserAskInput,
} from "./t3team-askUserWriter.ts";

const threadId = ThreadId.make("thread-machine-source");
const threadProject = ProjectId.make("project-of-the-thread");
const TOOLS_URL = "https://nexplore.ghe.com/acme/tools.git";
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-machine-source"),
  requestNamespace: "provider-session-machine-source",
  thread: {
    threadId,
    providerSessionId: "provider-session-machine-source",
    providerInstanceId: ProviderInstanceId.make("pack-test"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "machine-source-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "machine-source-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const verifiedTools = {
  setting: { repository: TOOLS_URL, branch: "setup" },
  repository: "acme/tools",
  branch: "setup",
  commit: "b".repeat(40),
  host: "nexplore.ghe.com",
  ownHost: "nexplore.ghe.com",
};

const proposalLayer = (verify: MachineSourceProposal["Service"]["verify"]) =>
  Layer.succeed(MachineSourceProposal, MachineSourceProposal.of({ verify }));

const callTool = (
  args: Record<string, unknown>,
  options: {
    readonly proposal: Layer.Layer<MachineSourceProposal> | undefined;
    readonly asked: Array<T3TeamAskUserAskInput>;
    readonly askFails?: string;
  },
) => {
  const services = Layer.mergeAll(
    Layer.mock(ThreadManagementService.ThreadManagementService)({
      getThreadShell: () =>
        Effect.succeed({
          id: threadId,
          projectId: threadProject,
          deletedAt: null,
          runtimeMode: "full-access",
          interactionMode: "default",
        } as never),
    }),
    Layer.mock(T3TeamAskUserWriter)({
      ask: (input) =>
        options.askFails === undefined
          ? Effect.sync(() => {
              options.asked.push(input);
              return { requestId: RuntimeRequestId.make("request-machine-source") };
            })
          : Effect.fail(new T3TeamAskUserError({ message: options.askFails })),
    }),
    options.proposal ?? Layer.empty,
  );
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provide(services),
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(
      Layer.succeed(
        T3TeamToolBroker,
        T3TeamToolBroker.of({
          bindSession: () => Effect.succeed(undefined),
          bindReadOnly: () => Effect.succeed(undefined),
        }),
      ),
    ),
  );
  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    return yield* server.callTool({ name: "t3_machine_set_source", arguments: args });
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
};

const NOTE =
  "Nothing is saved until the user accepts; the answer arrives as the user's next message.";

const ARGS = {
  repository: "acme/tools",
  branch: "setup",
  why: "Ada wrote a devcontainer for this project on that branch.",
  author: "ada",
};

it.effect("posts one question whose id carries the proposal and answers asked", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  const verifying: Array<unknown> = [];
  const proposal = proposalLayer((projectId, input) =>
    Effect.sync(() => {
      verifying.push([projectId, input]);
      return verifiedTools;
    }),
  );
  return Effect.gen(function* () {
    const result = yield* callTool(ARGS, { proposal, asked });
    expect(verifying).toEqual([[threadProject, { repository: "acme/tools", branch: "setup" }]]);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.threadId).toBe(threadId);
    const [question] = asked[0]?.questions ?? [];
    expect(decodeMachineSourceQuestionId(question?.id ?? "")).toEqual(verifiedTools.setting);
    expect(question?.header).toBe("Machine source");
    // The first line is built from the proposal alone and names the host.
    expect(question?.question?.startsWith(machineSourceQuestionLine(verifiedTools.setting))).toBe(
      true,
    );
    expect(question?.question).toContain("nexplore.ghe.com/acme/tools");
    expect(question?.question).toContain("Pinned at commit bbbbbbb");
    expect(question?.question).toContain("Ada wrote a devcontainer");
    expect(question?.question).toContain("ada");
    expect(question?.options.map((option) => option.label)).toEqual([
      MACHINE_SOURCE_ACCEPT_LABEL,
      MACHINE_SOURCE_DECLINE_LABEL,
    ]);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      asked: true,
      requestId: "request-machine-source",
      questionId: question?.id,
      repository: "acme/tools",
      branch: "setup",
      note: NOTE,
    });
    // Only owner/repo is shown back; the clone URL stays in the question id.
    expect(JSON.stringify(result.content)).not.toContain("https://");
  });
});

it.effect("warns when the host is not the project's repository host", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  const evil = {
    ...verifiedTools,
    setting: { repository: "https://evil.example/acme/tools.git", branch: "setup" },
    host: "evil.example",
  };
  return Effect.gen(function* () {
    yield* callTool(ARGS, { proposal: proposalLayer(() => Effect.succeed(evil)), asked });
    const [question] = asked[0]?.questions ?? [];
    expect(question?.question).toContain("evil.example/acme/tools");
    expect(question?.question).toContain("not this project's repository host");
  });
});

it.effect("shows the agent's words as plain text, never as markdown", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  return Effect.gen(function* () {
    yield* callTool(
      {
        ...ARGS,
        why: "See [acme/tools](https://evil.example) and `rm` here",
        author: "**ada**",
      },
      { proposal: proposalLayer(() => Effect.succeed(verifiedTools)), asked },
    );
    const text = asked[0]?.questions[0]?.question ?? "";
    expect(text).not.toMatch(/(?<!\\)\]\(/);
    expect(text).not.toContain("`rm`");
    expect(text).not.toContain("**ada**");
    expect(text).not.toContain("https://evil.example");
  });
});

it.effect("returns the proposal check's named reason as a tool error and asks nothing", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  const proposal = proposalLayer(() =>
    Effect.fail(
      new ProjectMachineDiscoveryError({
        reason: "invalid_source",
        message: "Branch setup was not found in acme/tools.",
      }),
    ),
  );
  return Effect.gen(function* () {
    const result = yield* callTool(ARGS, { proposal, asked });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Branch setup was not found in acme/tools.");
    expect(asked).toEqual([]);
  });
});

it.effect("refuses a missing reason or repository before checking anything", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  const proposal = proposalLayer(() => Effect.die("must not be checked"));
  return Effect.gen(function* () {
    const noWhy = yield* callTool({ ...ARGS, why: "  " }, { proposal, asked });
    expect(noWhy.isError).toBe(true);
    expect(JSON.stringify(noWhy.content)).toContain("Say why");
    const noRepository = yield* callTool({ ...ARGS, repository: " " }, { proposal, asked });
    expect(noRepository.isError).toBe(true);
    expect(JSON.stringify(noRepository.content)).toContain("Name the repository");
    expect(asked).toEqual([]);
  });
});

it.effect("returns the question writer's refusal, such as a question already pending", () => {
  const proposal = proposalLayer(() => Effect.succeed(verifiedTools));
  return Effect.gen(function* () {
    const result = yield* callTool(ARGS, {
      proposal,
      asked: [],
      askFails: "A question is already pending on this thread (requestId: request-1).",
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("already pending");
  });
});

it.effect("refuses clearly where the server cannot check a proposal", () =>
  Effect.gen(function* () {
    const result = yield* callTool(ARGS, { proposal: undefined, asked: [] });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("cannot be proposed on this server");
  }),
);
