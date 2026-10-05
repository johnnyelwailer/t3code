/**
 * ProjectStoreV2 persistence of the fork's project main repository (`mainRepository`): set with a
 * moved workspace root, untouched by unrelated meta updates, cleared by null.
 */
import { assert, it } from "@effect/vitest";
import { EventId, ProjectId, type ProjectMainRepository } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as ProjectStore from "./ProjectStore.ts";

it.layer(ProjectStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)))(
  "ProjectStoreV2 main repository",
  (it) => {
    it.effect("persists the main repository, leaves it when omitted, and clears it on null", () =>
      Effect.gen(function* () {
        const projects = yield* ProjectStore.ProjectStoreV2;
        const projectId = ProjectId.make("project-main-repo");
        const now = "2026-03-24T00:00:00.000Z";
        const mainRepository: ProjectMainRepository = {
          url: "https://github.com/acme/alpha",
          checkoutPath: "/home/repo/.t3team/references/01-alpha",
          projectRoot: "/home/repo",
          selection: "user",
        };
        const created = {
          sequence: 1,
          eventId: EventId.make("evt-main-repo-1"),
          aggregateKind: "project" as const,
          aggregateId: projectId,
          occurredAt: now,
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
          type: "project.created" as const,
          payload: {
            projectId,
            title: "Main repo",
            workspaceRoot: "/home/repo",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
          },
        };
        yield* projects.apply(created);
        assert.isNull(Option.getOrThrow(yield* projects.get(projectId)).mainRepository);

        // Set it together with the moved workspace root.
        yield* projects.apply({
          ...created,
          sequence: 2,
          eventId: EventId.make("evt-main-repo-2"),
          type: "project.meta-updated",
          payload: {
            projectId,
            workspaceRoot: mainRepository.checkoutPath,
            mainRepository,
            updatedAt: now,
          },
        });
        const set = Option.getOrThrow(yield* projects.get(projectId));
        assert.strictEqual(set.workspaceRoot, mainRepository.checkoutPath);
        assert.deepStrictEqual(set.mainRepository, mainRepository);

        // An update that does not mention it leaves it alone.
        yield* projects.apply({
          ...created,
          sequence: 3,
          eventId: EventId.make("evt-main-repo-3"),
          type: "project.meta-updated",
          payload: { projectId, title: "Renamed", updatedAt: now },
        });
        assert.deepStrictEqual(
          Option.getOrThrow(yield* projects.get(projectId)).mainRepository,
          mainRepository,
        );

        // null clears it.
        yield* projects.apply({
          ...created,
          sequence: 4,
          eventId: EventId.make("evt-main-repo-4"),
          type: "project.meta-updated",
          payload: { projectId, mainRepository: null, updatedAt: now },
        });
        assert.isNull(Option.getOrThrow(yield* projects.get(projectId)).mainRepository);
      }),
    );
  },
);
