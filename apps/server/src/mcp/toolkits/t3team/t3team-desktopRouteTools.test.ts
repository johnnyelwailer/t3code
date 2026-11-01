import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  ProjectId,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  decodeDesktopRouteQuestionId,
  desktopRouteQuestionLine,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  T3TeamAskUserError,
  T3TeamAskUserWriter,
  type T3TeamAskUserAskInput,
} from "./t3team-askUserWriter.ts";

const threadId = ThreadId.make("thread-desktop-route");
const threadProject = ProjectId.make("project-of-the-thread");

const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-desktop-route"),
  requestNamespace: "provider-session-desktop-route",
  thread: {
    threadId,
    providerSessionId: "provider-session-desktop-route",
    providerInstanceId: ProviderInstanceId.make("pack-test"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "desktop-route-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "desktop-route-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const callTool = (
  args: Record<string, unknown>,
  options: { readonly asked: Array<T3TeamAskUserAskInput>; readonly askFails?: string },
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
              return { requestId: RuntimeRequestId.make("request-desktop-route") };
            })
          : Effect.fail(new T3TeamAskUserError({ message: options.askFails })),
    }),
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
    return yield* server.callTool({ name: "request_desktop_route", arguments: args });
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
};

const ARGS = {
  target: "npm.nexplore.ch",
  reason: "npm ci times out on the runner.",
  internal: true,
};
const withFlag = <A, E, R>(on: boolean, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const before = process.env.NEXI_FF_AGENTS_DESKTOP_ROUTE;
      if (on) process.env.NEXI_FF_AGENTS_DESKTOP_ROUTE = "1";
      else delete process.env.NEXI_FF_AGENTS_DESKTOP_ROUTE;
      return before;
    }),
    () => effect,
    (before) =>
      Effect.sync(() => {
        if (before === undefined) delete process.env.NEXI_FF_AGENTS_DESKTOP_ROUTE;
        else process.env.NEXI_FF_AGENTS_DESKTOP_ROUTE = before;
      }),
  );

it.effect("posts one question whose id carries the proposal, and grants nothing", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  return withFlag(
    true,
    Effect.gen(function* () {
      const result = yield* callTool(ARGS, { asked });
      expect(asked).toHaveLength(1);
      const [question] = asked[0]?.questions ?? [];
      const proposal = { target: "npm.nexplore.ch", internal: true };
      expect(decodeDesktopRouteQuestionId(question?.id ?? "")).toEqual(proposal);
      expect(question?.header).toBe(DESKTOP_ROUTE_QUESTION_HEADER);
      expect(question?.question?.startsWith(desktopRouteQuestionLine(proposal))).toBe(true);
      expect(question?.question).toContain("npm ci times out");
      expect(question?.options.map((option) => option.label)).toEqual([
        DESKTOP_ROUTE_ONCE_LABEL,
        DESKTOP_ROUTE_SESSION_LABEL,
        DESKTOP_ROUTE_DECLINE_LABEL,
      ]);
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        asked: true,
        requestId: "request-desktop-route",
        target: "npm.nexplore.ch",
      });
    }),
  );
});

it.effect("offers 'Always for this host' only for a public host, never an internal one", () => {
  const publicAsked: Array<T3TeamAskUserAskInput> = [];
  const hiddenAsked: Array<T3TeamAskUserAskInput> = [];
  const labels = (asked: Array<T3TeamAskUserAskInput>) =>
    asked[0]?.questions?.[0]?.options.map((option) => option.label) ?? [];
  return withFlag(
    true,
    Effect.gen(function* () {
      yield* callTool(
        { ...ARGS, target: "registry.npmjs.org", internal: false },
        { asked: publicAsked },
      );
      // The agent says public, the address says private: the address wins.
      yield* callTool({ ...ARGS, target: "10.1.2.3", internal: false }, { asked: hiddenAsked });
      expect(labels(publicAsked)).toContain(DESKTOP_ROUTE_ALWAYS_LABEL);
      expect(labels(hiddenAsked)).not.toContain(DESKTOP_ROUTE_ALWAYS_LABEL);
    }),
  );
});

it.effect("is off unless the flag is on", () => {
  const asked: Array<T3TeamAskUserAskInput> = [];
  return withFlag(
    false,
    Effect.gen(function* () {
      const result = yield* callTool(ARGS, { asked });
      expect(result.isError).toBe(true);
      expect(asked).toHaveLength(0);
      expect(JSON.stringify(result.content)).toContain("request_desktop_route");
    }),
  );
});

it.effect(
  "refuses a target that is not one plain token, a missing or long reason, and a failing ask",
  () =>
    withFlag(
      true,
      Effect.gen(function* () {
        for (const target of [
          "*",
          "*.nexplore.ch",
          "a b",
          "user@host",
          "",
          "  ",
          "x".repeat(301),
          "host\u202Eevil",
        ]) {
          const asked: Array<T3TeamAskUserAskInput> = [];
          const result = yield* callTool({ ...ARGS, target }, { asked });
          expect(result.isError, JSON.stringify(target)).toBe(true);
          expect(asked).toHaveLength(0);
        }
        const asked: Array<T3TeamAskUserAskInput> = [];
        expect((yield* callTool({ ...ARGS, reason: "   " }, { asked })).isError).toBe(true);
        expect((yield* callTool({ ...ARGS, reason: "y".repeat(501) }, { asked })).isError).toBe(
          true,
        );
        expect(
          (yield* callTool(ARGS, { asked, askFails: "a question is already pending" })).isError,
        ).toBe(true);
      }),
    ),
);

it.effect(
  "shows the agent's words as plain text, never as markdown, and states an internal address",
  () => {
    const asked: Array<T3TeamAskUserAskInput> = [];
    return withFlag(
      true,
      Effect.gen(function* () {
        yield* callTool(
          {
            target: "https://reg.example/[a](b)",
            reason: "See [docs](https://evil.example) and `rm`",
            internal: true,
          },
          { asked },
        );
        const text = asked[0]?.questions[0]?.question ?? "";
        expect(text).not.toMatch(/\]\(https:\/\/evil/);
        expect(text).not.toContain("`rm`");
        expect(text).toContain("private network address");
      }),
    );
  },
);
