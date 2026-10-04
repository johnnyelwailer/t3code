/**
 * start_child `environment` argument: bind a child session to a DIFFERENT
 * execution environment (another T3 server) than the creating one.
 *
 * Coverage:
 * - `readStartChildEnvironment` shape validation (absent / valid / invalid).
 * - `readStartChildArgs` passes the binding through (and omits it when absent).
 * - `makeStartChildThread`: default stays byte-identical (no `environment` key
 *   on the thread.create command, no environment fields in the result);
 *   a cross-environment binding stamps the command, the handoff payload, and
 *   the launch result (with the delivery-boundary note); a same-environment
 *   binding (this server's own id) is a no-op.
 *
 * Kept in a t3team-prefixed file per the additive guard.
 */
import { ThreadId, type ModelSelection, type OrchestrationThread } from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import { describe, expect, it } from "vite-plus/test";

import * as Effect from "effect/Effect";

import { readStartChildArgs } from "./t3team-toolBrokerStartChildArgs.ts";
import { readStartChildEnvironment } from "./t3team-toolBrokerStartChildEnvironment.ts";
import { makeStartChildThread } from "./t3team-toolBrokerStartChild.ts";

// ── readStartChildEnvironment ────────────────────────────────────────────────

describe("readStartChildEnvironment", () => {
  it("treats absent (undefined/null) as same-environment", () => {
    expect(readStartChildEnvironment(undefined)).toEqual({ ok: true, value: undefined });
    expect(readStartChildEnvironment(null)).toEqual({ ok: true, value: undefined });
  });

  it("accepts { id, label } and stamps the binding", () => {
    const result = readStartChildEnvironment({ id: "env-remote", label: "GHA runner" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ environmentId: "env-remote", label: "GHA runner" });
    }
  });

  it("accepts { id } without a label", () => {
    const result = readStartChildEnvironment({ id: "env-remote" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ environmentId: "env-remote" });
      if (result.value) expect(result.value.label).toBeUndefined();
    }
  });

  it("accepts the legacy environment_id key", () => {
    const result = readStartChildEnvironment({ environment_id: "env-remote" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.environmentId).toBe("env-remote");
  });

  it("rejects a non-object value", () => {
    for (const bad of ["env-remote", 42, ["env-remote"], true]) {
      const result = readStartChildEnvironment(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("'environment' must be an object");
    }
  });

  it("rejects a missing or empty id", () => {
    for (const bad of [{}, { label: "x" }, { id: "" }, { id: 7 }]) {
      const result = readStartChildEnvironment(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("'environment.id'");
    }
  });
});

// ── readStartChildArgs plumbing ──────────────────────────────────────────────

describe("readStartChildArgs environment plumbing", () => {
  it("omits the environment key entirely when the argument is absent", () => {
    const result = readStartChildArgs({ name: "child", isolation: "shared" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("environment");
    }
  });

  it("carries the parsed binding into the args", () => {
    const result = readStartChildArgs({
      name: "child",
      isolation: "shared",
      environment: { id: "env-remote", label: "GHA runner" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.environment).toEqual({
        environmentId: "env-remote",
        label: "GHA runner",
      });
    }
  });

  it("surfaces environment validation errors from the args parse", () => {
    const result = readStartChildArgs({
      name: "child",
      isolation: "shared",
      environment: { id: "" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("'environment.id'");
  });
});

// ── makeStartChildThread wiring ──────────────────────────────────────────────

const LOCAL_ENV_ID = "env-local";

function makeHarness() {
  const commands: unknown[] = [];
  const project = {
    id: ThreadId.make("p1"),
    title: "Project",
    workspaceRoot: "/tmp/project",
    defaultModelSelection: {
      provider: "nexplore",
      model: "nexplore-a",
    },
  } as unknown as {
    readonly id: unknown;
    readonly title: string;
    readonly workspaceRoot: string;
    readonly defaultModelSelection: unknown;
  };
  const thread = {
    id: ThreadId.make("parent-1"),
    projectId: "p1",
    title: "Parent",
    modelSelection: {
      instanceId: "nexplore",
      model: "nexplore-a",
      options: [],
    } as unknown as ModelSelection,
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    worktreePath: null,
  } as unknown as OrchestrationThread;
  const orchestration = {
    dispatch: (command: unknown) => {
      commands.push(command);
      return Effect.void;
    },
  };
  return {
    commands,
    startChild: makeStartChildThread({
      loadThreadProject: () => Effect.succeed({ project: project as never, thread }),
      orchestration: orchestration as never,
      contextStore: { get: () => Effect.succeed(undefined), put: () => Effect.void },
      services: {
        localEnvironmentId: LOCAL_ENV_ID,
        listProviders: () => Effect.succeed([]),
      },
    }),
  };
}

const threadCreateCommand = (commands: readonly unknown[]) =>
  commands.find((command) => (command as { type?: string }).type === "thread.create") as
    | Record<string, unknown>
    | undefined;

describe("makeStartChildThread environment binding", () => {
  effectIt.effect("default: no environment argument — command stays byte-identical", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
      });
      const create = threadCreateCommand(commands);
      expect(create).toBeDefined();
      expect(create).not.toHaveProperty("environment");
      expect(result).toMatchObject({ ok: true });
      expect(result).not.toHaveProperty("environment");
      expect(result).not.toHaveProperty("environment_note");
    }),
  );

  effectIt.effect("cross-environment: command, handoff, and result are stamped", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
        environment: { id: "env-remote", label: "GHA runner" },
      });
      const create = threadCreateCommand(commands);
      expect(create).toBeDefined();
      expect(create?.environment).toEqual({ environmentId: "env-remote", label: "GHA runner" });

      // Both handoff activities carry the binding in their payload.
      const handoffs = commands.filter(
        (command) => (command as { type?: string }).type === "thread.activity.append",
      ) as Array<Record<string, unknown>>;
      const started = handoffs.find(
        (command) =>
          (command as { activity?: { kind?: string } }).activity?.kind === "t3team.handoff.started",
      );
      const created = handoffs.find(
        (command) =>
          (command as { activity?: { kind?: string } }).activity?.kind === "t3team.handoff.created",
      );
      expect(started?.activity).toMatchObject({
        payload: { environment: { environmentId: "env-remote", label: "GHA runner" } },
      });
      expect(created?.activity).toMatchObject({
        payload: { environment: { environmentId: "env-remote", label: "GHA runner" } },
      });

      expect(result).toMatchObject({
        ok: true,
        environment: { environmentId: "env-remote", label: "GHA runner" },
      });
      expect(String(result.environment_note)).toContain("send_message, mailbox, children ops");
    }),
  );

  effectIt.effect("same-environment id: treated as a no-op, nothing stamped", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
        environment: { id: LOCAL_ENV_ID, label: "this server" },
      });
      const create = threadCreateCommand(commands);
      expect(create).toBeDefined();
      expect(create).not.toHaveProperty("environment");
      expect(result).not.toHaveProperty("environment");
      expect(result).not.toHaveProperty("environment_note");
    }),
  );
});
