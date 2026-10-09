/**
 * A workflow's parentless "Orchestration author" thread is host machinery: it must not reach
 * the V2 shell (sidebar rows, live deltas, archive) while the host can still read it.
 */
import { assert, it } from "@effect/vitest";
import { CommandId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { workflowAuthorThreadId } from "../t3team-workflowAuthorSession.ts";
import { T3TeamThreadLineage } from "../t3team-v2/t3team-threadLineage.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "../t3team-v2/t3team-v2Orchestrator.testkit.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import {
  archivedShellStreamItemFromThreadShell,
  buildActiveShellSnapshot,
  shellStreamItemFromThreadShell,
} from "./ShellStream.ts";
import { shownShell } from "./t3team-hiddenShellThreads.ts";

it.layer(makeT3TeamV2TestLayer("t3team-hidden-shell-threads"))("hidden shell threads", (it) => {
  it.effect("keeps the workflow author thread off the shell but readable for the host", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const lineage = yield* T3TeamThreadLineage;
      const author = ThreadId.make(workflowAuthorThreadId("run-hidden"));
      const ordinary = ThreadId.make("thread:ordinary");
      const parent = ThreadId.make("thread:parent");
      // A parented thread is not host machinery even if its id looks like an author's.
      const parentedLookalike = ThreadId.make(workflowAuthorThreadId("run-parented"));
      yield* createTestThread(author, "Orchestration author");
      yield* createTestThread(ordinary, "Ordinary");
      yield* createTestThread(parent, "Parent");
      yield* createTestThread(parentedLookalike, "Child");
      yield* lineage.setThreadLineage({
        threadId: parentedLookalike,
        parentThreadId: parent,
        relationshipToParent: "subagent",
      });

      // The navigation shell both the WS subscription and the HTTP snapshot load.
      const snapshot = buildActiveShellSnapshot({
        projects: [],
        threads: yield* orchestrator.getShellSnapshot({ location: "active" }),
        snapshotSequence: 1,
      });
      const ids = snapshot.threads.map((thread) => thread.id);
      assert.notInclude(ids, author);
      assert.includeMembers(ids, [ordinary, parent, parentedLookalike]);
      assert.include(
        (yield* projections.getShellSnapshot()).threads.map((thread) => thread.id),
        author,
        "the raw projection still has it",
      );

      // The host still reads its thread.
      const authorShell = yield* projections.getThreadShell(author);
      assert.strictEqual(authorShell?.id, author);

      // A live delta for it reads as removed (clearing any row a client cached) …
      const stored = { sequence: 7, event: { threadId: author } };
      assert.deepStrictEqual(
        shellStreamItemFromThreadShell({ stored, shell: shownShell(authorShell) }),
        {
          kind: "thread.removed",
          sequence: 7,
          location: "active",
          threadId: author,
        },
      );
      const ordinaryShell = yield* projections.getThreadShell(ordinary);
      assert.strictEqual(
        shellStreamItemFromThreadShell({
          stored: { sequence: 8, event: { threadId: ordinary } },
          shell: shownShell(ordinaryShell),
        }).kind,
        "thread.updated",
      );

      // … and once retired (archived) it stays out of the archive too.
      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make(`archive:${author}`),
        threadId: author,
      });
      const archive = yield* orchestrator.getShellSnapshot({ location: "archive" });
      assert.notInclude(
        archive.archivedThreads.map((thread) => thread.id),
        author,
      );
      assert.include(
        (yield* projections.getShellSnapshot({ location: "archive" })).archivedThreads.map(
          (thread) => thread.id,
        ),
        author,
      );
      assert.ok(authorShell);
      assert.isNull(
        archivedShellStreamItemFromThreadShell({
          stored: { sequence: 9, event: { threadId: author } } as never,
          shell: shownShell({ ...authorShell, archivedAt: authorShell.updatedAt }),
        }),
      );
    }),
  );
});
