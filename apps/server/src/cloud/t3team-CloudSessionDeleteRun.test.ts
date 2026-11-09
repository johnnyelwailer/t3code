import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { makeClaimLedger } from "./t3team-CloudSessionClaim.ts";
import type { DeleteFlow, DeleteSessionContext } from "./t3team-CloudSessionDeleteFlow.ts";
import { deleteCloudSession } from "./t3team-CloudSessionDeleteRun.ts";
import type { MachineCheckoutInput } from "./t3team-CloudSessionMachineCheckout.ts";
import type { NexiBrokerService } from "./t3team-NexiBrokerService.ts";
import type {
  GitHubActionsRequest,
  WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const WS = "m-pj.acme.api_";
const ENTRA = `o${"0f".repeat(16)}`;
const NAME = `nexi-session [s1] · broker · machine · ws ${WS} · repo nexplore.ghe.com/acme/api`;

const run = (id: number, status: string, name = NAME): WorkflowRunSummary => ({
  id,
  status,
  conclusion: null,
  createdAt: "",
  updatedAt: "",
  htmlUrl: "",
  name,
  actor: "pj",
  actorId: 1283972,
});

const broker: NexiBrokerService["Service"] = {
  enabled: false,
  status: { enabled: false, accountId: null },
  requestGrant: () => Effect.die("unused"),
  attach: () => Effect.die("unused"),
  pair: () => Effect.die("unused"),
  claimStandby: () => Effect.succeed(null),
  reportInterest: () => Effect.void,
  sessions: Effect.succeed([]),
};

/** A fleet whose cache list is `pages` (100-entry pages read as "more may follow"). */
const makeFlow = (options: {
  pages: ReadonlyArray<ReadonlyArray<{ id: number; key: string }>>;
  runs?: ReadonlyArray<WorkflowRunSummary>;
}) =>
  Effect.gen(function* () {
    const deleted: number[] = [];
    const checkouts: MachineCheckoutInput[] = [];
    const runInteractive = (request: GitHubActionsRequest) =>
      Effect.sync(() => {
        const path = request.kind === "rest" ? request.path : "";
        const page = /actions\/caches\?per_page=100&page=([0-9]+)/.exec(path);
        if (page !== null) {
          const entries = options.pages[Number(page[1]) - 1] ?? [];
          return { body: JSON.stringify({ actions_caches: entries }), truncated: false };
        }
        const removed = /actions\/caches\/([0-9]+)$/.exec(path);
        if (removed !== null) deleted.push(Number(removed[1]));
        return { body: "{}", truncated: false };
      });
    const flow: DeleteFlow = {
      repoRef: {
        host: "nexplore.ghe.com",
        owner: "hive",
        repo: "nx-nexi",
        workflowFileName: "session.yml",
      },
      gh: {
        runInteractive,
        resolveLogin: () => Effect.succeed("pj"),
        listRunsFor: () => Effect.succeed(options.runs ?? [run(999, "completed")]),
        getRun: (id) => Effect.succeed(run(id, "completed")),
      },
      claims: yield* makeClaimLedger(),
      broker,
      machineState: {
        deleteMachineCheckout: (input) =>
          Effect.sync(() => {
            checkouts.push(input);
            return { wipBranch: null };
          }),
      },
      listLocalProjects: () =>
        Effect.succeed([
          {
            title: "api",
            workspaceRoot: "D:/api",
            remoteUrl: "https://nexplore.ghe.com/acme/api.git",
          },
        ]),
      pinnedCommitFor: () => Effect.succeed(null),
    };
    return { flow, deleted, checkouts };
  });

const context = (over: Partial<DeleteSessionContext> = {}): DeleteSessionContext => ({
  runId: 999,
  kind: "run",
  run: run(999, "completed"),
  workspace: WS,
  repository: { host: "nexplore.ghe.com", owner: "acme", name: "api" },
  ...over,
});

const key = (owner: string, workspace: string, suffix: string) =>
  `nexi-session-userdata-${owner}.${workspace}/${suffix}`;

describe("deleteCloudSession", () => {
  it.effect(
    "removes every snapshot the next session of this workspace would restore, and only those",
    () =>
      Effect.gen(function* () {
        const { flow, deleted, checkouts } = yield* makeFlow({
          pages: [
            [
              { id: 1, key: key(ENTRA, WS, "999") },
              { id: 2, key: key(ENTRA, WS, "999-final") },
              { id: 3, key: key(ENTRA, WS, "812") },
              { id: 4, key: key(ENTRA, "u-pj_", "812") },
              { id: 5, key: key("g42", WS, "700") },
              { id: 6, key: "unrelated/999" },
            ],
          ],
        });
        yield* deleteCloudSession(flow, context());
        assert.deepEqual([...deleted].sort(), [1, 2, 3]);
        // The broker run's owner is the one its own snapshot keys carry.
        assert.equal(checkouts[0]?.snapshotOwner, ENTRA);
        assert.equal(checkouts[0]?.runId, 999);
      }),
  );

  it.effect("refuses, touching nothing, while another run of the workspace is live", () =>
    Effect.gen(function* () {
      const { flow, deleted, checkouts } = yield* makeFlow({
        pages: [[{ id: 1, key: key(ENTRA, WS, "999") }]],
        runs: [run(999, "completed"), run(1000, "in_progress")],
      });
      const error = yield* Effect.flip(deleteCloudSession(flow, context()));
      assert.instanceOf(error, CloudSessionFailedError);
      assert.equal(error.reason, "delete_blocked");
      assert.deepEqual(deleted, []);
      assert.deepEqual(checkouts, []);
    }),
  );

  it.effect("reports a cache list longer than one delete reads as not fully removed", () =>
    Effect.gen(function* () {
      const full = (page: number) =>
        Array.from({ length: 100 }, (_, i) => ({ id: page * 1000 + i + 1, key: `other/${i}` }));
      const pages = Array.from({ length: 21 }, (_, page) => full(page));
      const { flow } = yield* makeFlow({
        pages: [[{ id: 1, key: key(ENTRA, WS, "999") }, ...full(99).slice(1)], ...pages],
      });
      const error = yield* Effect.flip(deleteCloudSession(flow, context()));
      assert.match(error.message, /not fully removed/);
    }),
  );

  it.effect("blocks when no owner can be named but the workspace has snapshots", () =>
    Effect.gen(function* () {
      const { flow, deleted } = yield* makeFlow({
        pages: [[{ id: 3, key: key(ENTRA, WS, "812") }]],
      });
      const error = yield* Effect.flip(deleteCloudSession(flow, context()));
      assert.equal(error.reason, "delete_blocked");
      assert.deepEqual(deleted, []);
    }),
  );
});
