import { assert, it } from "@effect/vitest";
import {
  CommandId,
  type Project,
  ProjectId,
  type ProjectMutation,
  type ProjectSourceBinding,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { projectMutationOperation } from "./project/ProjectMutation.ts";
import { ProjectOperationError, type ProjectService } from "./project/ProjectService.ts";
import {
  projectSourceClaimMessage,
  T3TeamProjectSourceBindingsLive,
} from "./t3team-projectSourceBindings.ts";

const at = "2026-10-01T00:00:00.000Z";
const jira = (externalProjectId: string): ProjectSourceBinding => ({
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId,
});

const seedProject = (id: string) =>
  Effect.flatMap(ProjectStore.ProjectStoreV2, (store) =>
    store.apply({
      type: "project.created",
      payload: {
        projectId: ProjectId.make(id),
        title: id,
        workspaceRoot: `/work/${id}`,
        defaultModelSelection: null,
        scripts: [],
        createdAt: at,
        updatedAt: at,
      },
    } as never),
  );

const sourceOf = (id: string) =>
  Effect.flatMap(ProjectStore.ProjectStoreV2, (store) =>
    store.getShell(ProjectId.make(id)).pipe(Effect.map((shell) => Option.getOrThrow(shell).source)),
  );

let runs = 0;
let failNext = false;
const projects: Pick<ProjectService["Service"], "create" | "delete" | "update"> = {
  create: () => Effect.sync(() => void (runs += 1)).pipe(Effect.as({} as Project)),
  delete: () => Effect.sync(() => void (runs += 1)).pipe(Effect.as({} as Project)),
  update: () =>
    Effect.suspend(() => {
      runs += 1;
      if (!failNext) return Effect.succeed({} as Project);
      failNext = false;
      return Effect.fail(
        new ProjectOperationError({ operation: "dispatch-project-command", cause: "boom" }),
      );
    }),
};
const update = (id: string, source?: ProjectSourceBinding): ProjectMutation => ({
  type: "project.update",
  commandId: CommandId.make(`cmd-${id}-${runs}`),
  projectId: ProjectId.make(id),
  ...(source === undefined ? {} : { source }),
});
const mutate = (mutation: ProjectMutation) => projectMutationOperation(projects, mutation);

const TestLayer = T3TeamProjectSourceBindingsLive.pipe(
  Layer.provideMerge(ProjectStore.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
);

it.layer(TestLayer)("project source bindings hook", (it) => {
  it.effect("binds, refuses a second active claim, restores on failure, unbinds on delete", () =>
    Effect.gen(function* () {
      yield* seedProject("a");
      yield* seedProject("b");

      // A wire mutation's source lands in the binding table and on the shell.
      yield* mutate(update("a", jira("100")));
      assert.deepStrictEqual(yield* sourceOf("a"), jira("100"));

      // The same external project cannot be claimed by a second active project.
      const runsBefore = runs;
      const claimed = yield* mutate(update("b", jira("100"))).pipe(Effect.flip);
      assert.strictEqual(
        projectSourceClaimMessage(claimed),
        "Work source 'atlassian:acct-1/100' is already bound to project 'a'.",
      );
      assert.strictEqual(runs, runsBefore, "the project command never ran");
      assert.isUndefined(yield* sourceOf("b"));

      // A failed project command restores the previous binding.
      failNext = true;
      assert.isTrue(Exit.isFailure(yield* mutate(update("a", jira("200"))).pipe(Effect.exit)));
      assert.deepStrictEqual(yield* sourceOf("a"), jira("100"));

      // An absent source never clears the stored binding.
      yield* mutate(update("a"));
      assert.deepStrictEqual(yield* sourceOf("a"), jira("100"));

      // Deleting the project releases the claim for others.
      yield* mutate({
        type: "project.delete",
        commandId: CommandId.make("del-a"),
        projectId: ProjectId.make("a"),
      });
      yield* mutate(update("b", jira("100")));
      assert.deepStrictEqual(yield* sourceOf("b"), jira("100"));
    }),
  );

  it.effect("a binding left by a deleted project is stale, not a claim", () =>
    Effect.gen(function* () {
      yield* seedProject("c");
      yield* seedProject("d");
      yield* mutate(update("c", jira("300")));
      // Deleted outside the hook (e.g. CLI): the row stays until the reactor sweeps it.
      yield* Effect.flatMap(ProjectStore.ProjectStoreV2, (store) =>
        store.apply({
          type: "project.deleted",
          payload: { projectId: ProjectId.make("c"), deletedAt: at },
        } as never),
      );
      yield* mutate(update("d", jira("300")));
      assert.deepStrictEqual(yield* sourceOf("d"), jira("300"));
    }),
  );
});
