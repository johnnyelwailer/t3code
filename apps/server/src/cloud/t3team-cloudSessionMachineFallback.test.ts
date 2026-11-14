import { CloudSessionFailedError, ProjectId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { CloudSessionMachines, type CloudSessionMachine } from "./t3team-CloudSessionMachine.ts";
import {
  fallBackToPlainOnMachineFailure,
  machineNeedsBroker,
} from "./t3team-cloudSessionMachineFallback.ts";
import type { CloudSessionPlainProject } from "./t3team-cloudSessionPlainProject.ts";

const projectId = ProjectId.make("p1");
const machine: CloudSessionMachine = {
  repository: {
    url: "https://nexplore.ghe.com/acme/api.git",
    host: "nexplore.ghe.com",
    owner: "acme",
    name: "api",
  },
  commit: "a".repeat(40),
  devcontainerPath: ".devcontainer/devcontainer.json",
  healthCheck: null,
  token: "t",
  author: { name: "A", email: "a@example.com" },
  teamSecretNames: [],
};
const workspace: CloudSessionPlainProject = { kind: "workspace", folder: "API-1", title: "API" };
const untracked = new CloudSessionFailedError({
  reason: "machine_unavailable",
  message: "Commit and push the machine definition in the project first.",
});

/** Machines whose plain project is `plain`, counting how often it is asked for. */
function machinesWith(plain: Effect.Effect<CloudSessionPlainProject, CloudSessionFailedError>) {
  const asked = { plain: 0 };
  const machines = CloudSessionMachines.of({
    resolve: () => Effect.die("unused"),
    resolveSetup: () => Effect.die("unused"),
    poolKeyOf: () => Effect.die("unused"),
    resolvePlain: () => Effect.sync(() => (asked.plain += 1)).pipe(Effect.andThen(plain)),
  });
  return { machines, asked };
}

describe("a project's machine that cannot be used", () => {
  it.effect("a working machine is used, with no reason and no plain project asked for", () =>
    Effect.gen(function* () {
      const { machines, asked } = machinesWith(Effect.succeed(workspace));
      const resolved = yield* Effect.succeed(machine).pipe(
        fallBackToPlainOnMachineFailure(machines, projectId, true),
      );
      assert.deepStrictEqual(resolved, { machine });
      assert.strictEqual(asked.plain, 0);
    }),
  );

  it.effect("falls back to a plain session in the project, asking for it once, saying why", () =>
    Effect.gen(function* () {
      const { machines, asked } = machinesWith(Effect.succeed(workspace));
      const resolved = yield* Effect.fail(untracked).pipe(
        fallBackToPlainOnMachineFailure(machines, projectId, true),
      );
      assert.deepStrictEqual(resolved, {
        machine: null,
        plain: workspace,
        fallback: untracked.message,
      });
      assert.strictEqual(asked.plain, 1);
    }),
  );

  it.effect("keeps the failure when a plain session in the project cannot start either", () =>
    Effect.gen(function* () {
      const { machines } = machinesWith(Effect.fail(untracked));
      const error = yield* Effect.fail(untracked).pipe(
        fallBackToPlainOnMachineFailure(machines, projectId, true),
        Effect.flip,
      );
      assert.strictEqual(error, untracked);
    }),
  );

  it.effect("without the broker falls back to a plain session with no project", () =>
    Effect.gen(function* () {
      const { machines, asked } = machinesWith(Effect.die("plain needs the broker"));
      const resolved = yield* Effect.fail(untracked).pipe(
        fallBackToPlainOnMachineFailure(machines, projectId, false),
      );
      assert.deepStrictEqual(resolved, { machine: null, plain: null, fallback: untracked.message });
      assert.strictEqual(asked.plain, 0);
    }),
  );

  it.effect(
    "without the broker a usable machine also falls back, saying the broker is missing",
    () =>
      Effect.gen(function* () {
        const { machines } = machinesWith(Effect.die("plain needs the broker"));
        const resolved = yield* Effect.succeed(machine).pipe(
          fallBackToPlainOnMachineFailure(machines, projectId, false),
        );
        assert.deepStrictEqual(resolved, {
          machine: null,
          plain: null,
          fallback: machineNeedsBroker().message,
        });
      }),
  );

  it.effect("a project with no machine stays plain, with no reason", () =>
    Effect.gen(function* () {
      const { machines } = machinesWith(Effect.die("unused"));
      const resolved = yield* Effect.succeed(null).pipe(
        fallBackToPlainOnMachineFailure(machines, projectId, false),
      );
      assert.deepStrictEqual(resolved, { machine: null });
    }),
  );
});
