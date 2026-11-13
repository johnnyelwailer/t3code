import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { makeClaimLedger } from "./t3team-CloudSessionClaim.ts";
import type { DeleteFlow, DeleteSessionContext } from "./t3team-CloudSessionDeleteFlow.ts";
import { findSessionForDelete } from "./t3team-CloudSessionDeleteFlow.ts";
import { deleteCloudSession, describeCloudSessionDelete } from "./t3team-CloudSessionDeleteRun.ts";
import { planDelete } from "./t3team-CloudSessionDeletePlan.ts";
import type { MachineCheckoutInput, ResumeBranch } from "./t3team-CloudSessionMachineCheckout.ts";
import type { NexiBrokerService } from "./t3team-NexiBrokerService.ts";
import type {
  GitHubActionsRequest,
  WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const WS = "m-pj.acme.api_";
const ENTRA = `o${"0f".repeat(16)}`;
const NAME = `nexi-session [s1] · broker · machine · ws ${WS} · repo nexplore.ghe.com/acme/api`;
const REPO = { host: "nexplore.ghe.com", owner: "acme", name: "api" };

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

const key = (owner: string, workspace: string, suffix: string) =>
  `nexi-session-userdata-${owner}.${workspace}/${suffix}`;

/** session.yml's teardown steps as the jobs API lists them after a clean stop. */
const SAVED = [
  { name: "Stage the final snapshot", conclusion: "success" },
  { name: "Save the final session snapshot (workspace continuity)", conclusion: "success" },
  { name: "Preserve the project machine's checkout for the next session", conclusion: "success" },
];

interface FleetOptions {
  readonly caches?: ReadonlyArray<{ id: number; key: string }>;
  readonly runs?: ReadonlyArray<WorkflowRunSummary>;
  readonly steps?: ReadonlyArray<{ name: string; conclusion: string }>;
  readonly brokerSessions?: ReadonlyArray<string>;
  readonly branches?: ReadonlyArray<ResumeBranch>;
  /** Cache deletes that fail; `gone` ones were removed anyway (a 404 from a race). */
  readonly failingDeletes?: ReadonlyMap<number, "gone" | "kept">;
  /** What the run's job annotated (stage-snapshot.sh's notice, machine-preserve.sh's warnings). */
  readonly annotations?: ReadonlyArray<{
    annotation_level: string;
    title: string;
    message: string;
  }>;
}

const makeFlow = (options: FleetOptions = {}) =>
  Effect.gen(function* () {
    const store = [...(options.caches ?? [])];
    const deleted: number[] = [];
    const checkouts: MachineCheckoutInput[] = [];
    const runInteractive = (request: GitHubActionsRequest) =>
      Effect.suspend(() => {
        const path = request.kind === "rest" ? request.path : "";
        const list = /actions\/caches\?per_page=100&page=([0-9]+)&key=([^&]+)$/.exec(path);
        if (list !== null) {
          const prefix = decodeURIComponent(list[2]!);
          const page = Number(list[1]);
          const matching = store.filter((entry) => entry.key.startsWith(prefix));
          const entries = matching.slice((page - 1) * 100, page * 100);
          return Effect.succeed({
            body: JSON.stringify({ actions_caches: entries }),
            truncated: false,
          });
        }
        const removed = /actions\/caches\/([0-9]+)$/.exec(path);
        if (removed !== null) {
          const id = Number(removed[1]);
          const failure = options.failingDeletes?.get(id);
          const at = store.findIndex((entry) => entry.id === id);
          if (failure !== "kept" && at >= 0) store.splice(at, 1);
          if (failure !== undefined) {
            return Effect.fail(
              new CloudSessionFailedError({ reason: "rejected", message: "Not Found" }),
            );
          }
          deleted.push(id);
        }
        if (path.endsWith("/jobs")) {
          const steps = (options.steps ?? SAVED).map((step) => ({ ...step, status: "completed" }));
          const jobs = [{ id: 77, steps }];
          return Effect.succeed({ body: JSON.stringify({ jobs }), truncated: false });
        }
        if (path.includes("check-runs/77/annotations")) {
          const body = JSON.stringify(options.annotations ?? []);
          return Effect.succeed({ body, truncated: false });
        }
        return Effect.succeed({ body: "{}", truncated: false });
      });
    const brokerSessions = options.brokerSessions;
    const broker: NexiBrokerService["Service"] = {
      enabled: brokerSessions !== undefined,
      status: { enabled: brokerSessions !== undefined, accountId: null },
      requestGrant: () => Effect.die("unused"),
      attach: () => Effect.die("unused"),
      pair: () => Effect.die("unused"),
      claimStandby: () => Effect.succeed(null),
      reportInterest: () => Effect.void,
      sessions: Effect.succeed((brokerSessions ?? []).map((runId) => ({ runId }))),
    };
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
        listResumeBranches: () => Effect.succeed(options.branches ?? []),
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
  repository: REPO,
  ...over,
});

const OWN = [
  { id: 1, key: key(ENTRA, WS, "999") },
  { id: 2, key: key(ENTRA, WS, "999-final") },
];

const PLAIN = "nexi-session [s1] · broker · ws u-pj_";
const plainContext = { workspace: "u-pj_", repository: null, run: run(999, "completed", PLAIN) };

const blockedBy = (options: FleetOptions, over: Partial<DeleteSessionContext> = {}) =>
  Effect.gen(function* () {
    const { flow, deleted, checkouts } = yield* makeFlow(options);
    const error = yield* Effect.flip(deleteCloudSession(flow, context(over)));
    assert.instanceOf(error, CloudSessionFailedError);
    assert.equal(error.reason, "delete_blocked", error.message);
    assert.deepEqual(deleted, [], "nothing removed");
    assert.deepEqual(checkouts, [], "the checkout untouched");
    return error.message;
  });

const branch = (owner: string): ResumeBranch => ({
  owner,
  branch: `nexi-resume/${owner}/${WS}`,
  sha: "b".repeat(40),
});

describe("deleteCloudSession", () => {
  it.effect(
    "removes every snapshot the next session of this workspace would restore, and only those",
    () =>
      Effect.gen(function* () {
        const { flow, deleted, checkouts } = yield* makeFlow({
          caches: [
            ...OWN,
            { id: 3, key: key(ENTRA, WS, "812") },
            { id: 4, key: key(ENTRA, "u-pj_", "812") },
            { id: 5, key: key("g42", WS, "700") },
            { id: 6, key: "unrelated/999" },
          ],
        });
        yield* deleteCloudSession(flow, context());
        assert.deepEqual([...deleted].sort(), [1, 2, 3]);
        assert.equal(checkouts[0]?.snapshotOwner, ENTRA);
        assert.equal(checkouts[0]?.runId, 999);
      }),
  );

  it.effect("counts a removal answered 404 as removed, and one still listed as not", () =>
    Effect.gen(function* () {
      const gone = yield* makeFlow({ caches: OWN, failingDeletes: new Map([[2, "gone"]]) });
      yield* deleteCloudSession(gone.flow, context());
      const kept = yield* makeFlow({ caches: OWN, failingDeletes: new Map([[2, "kept"]]) });
      const error = yield* Effect.flip(deleteCloudSession(kept.flow, context()));
      assert.match(error.message, /not fully removed/);
    }),
  );

  it.effect(
    "reports a workspace with more snapshots than one delete reads as not fully removed",
    () =>
      Effect.gen(function* () {
        const older = Array.from({ length: 2100 }, (_, i) => ({
          id: 10 + i,
          key: key(ENTRA, WS, `${100 + (i % 800)}`),
        }));
        const { flow } = yield* makeFlow({ caches: [...OWN, ...older] });
        const error = yield* Effect.flip(deleteCloudSession(flow, context()));
        assert.match(error.message, /not fully removed/);
      }),
  );

  it.effect("refuses when the stop did not save the final snapshot or preserve the checkout", () =>
    Effect.gen(function* () {
      const failed = (name: string) =>
        SAVED.map((step) => (step.name === name ? { name, conclusion: "failure" } : step));
      const save = yield* blockedBy({ caches: OWN, steps: failed(SAVED[1]!.name) });
      assert.match(save, /final session snapshot/);
      const preserve = yield* blockedBy({ caches: OWN, steps: failed(SAVED[2]!.name) });
      assert.match(preserve, /Preserve the project machine's checkout/);
      yield* blockedBy({ caches: OWN, steps: SAVED.slice(0, 2) });
    }),
  );

  it.effect("accepts an idle release, whose final save is skipped after the handoff save", () =>
    Effect.gen(function* () {
      const steps = [
        { name: "Save session snapshot (workspace continuity)", conclusion: "success" },
        SAVED[0]!,
        { name: SAVED[1]!.name, conclusion: "skipped" },
        SAVED[2]!,
      ];
      const { flow, deleted } = yield* makeFlow({ caches: OWN, steps });
      yield* deleteCloudSession(flow, context());
      assert.deepEqual([...deleted].sort(), [1, 2]);
    }),
  );

  it.effect("refuses, touching nothing, while another run of the workspace is live", () =>
    Effect.gen(function* () {
      yield* blockedBy({ caches: OWN, runs: [run(999, "completed"), run(1000, "in_progress")] });
    }),
  );

  it.effect("refuses while the broker runs a session of this user the run list cannot place", () =>
    Effect.gen(function* () {
      const message = yield* blockedBy({ caches: OWN, brokerSessions: ["999", "4242"] });
      assert.match(message, /4242/);
      const { flow } = yield* makeFlow({ caches: OWN, brokerSessions: ["999"] });
      yield* deleteCloudSession(flow, context());
    }),
  );

  it.effect("refuses to wipe the shared plain workspace another session used", () =>
    Effect.gen(function* () {
      const keys = [
        { id: 1, key: key(ENTRA, "u-pj_", "999") },
        { id: 3, key: key(ENTRA, "u-pj_", "812") },
      ];
      const steps = SAVED.slice(0, 2);
      const message = yield* blockedBy({ caches: keys, steps }, plainContext);
      assert.match(message, /Stop/);
      const alone = yield* makeFlow({ caches: keys.slice(0, 1), steps });
      yield* deleteCloudSession(alone.flow, context(plainContext));
      assert.deepEqual(alone.deleted, [1]);
    }),
  );

  it.effect("refuses when a later session of the machine holds newer state", () =>
    Effect.gen(function* () {
      const later = { id: 7, key: key(ENTRA, WS, "1200-final") };
      const message = yield* blockedBy({ caches: [...OWN, later] });
      assert.match(message, /1200/);
    }),
  );

  it.effect("names the earlier sessions whose state goes with the machine", () =>
    Effect.gen(function* () {
      const { flow } = yield* makeFlow({
        caches: [...OWN, { id: 3, key: key(ENTRA, WS, "812") }],
        runs: [run(999, "completed"), run(700, "completed")],
      });
      const plan = yield* planDelete(flow, context(), run(999, "completed"));
      assert.deepEqual([...plan.otherSessions].sort(), [700, 812]);
    }),
  );

  it.effect("refuses a repository-bound workspace whose run never named its repository", () =>
    Effect.gen(function* () {
      const unnamed = run(999, "completed", `nexi-session [s1] · broker · ws ${WS}`);
      yield* blockedBy({ caches: OWN }, { repository: null, run: unnamed });
    }),
  );

  it.effect("refuses a run whose workspace cannot be identified", () =>
    Effect.gen(function* () {
      const old = run(999, "completed", "nexi-session [s1]");
      yield* blockedBy({}, { workspace: null, repository: null, run: old });
    }),
  );

  it.effect(
    "names a broker run's owner from its only resume branch once its snapshots are gone",
    () =>
      Effect.gen(function* () {
        const { flow, checkouts } = yield* makeFlow({ branches: [branch(ENTRA)] });
        yield* deleteCloudSession(flow, context());
        assert.equal(checkouts[0]?.snapshotOwner, ENTRA);
        yield* blockedBy({ branches: [branch(ENTRA), branch(`o${"1".repeat(32)}`)] });
        yield* blockedBy({ caches: [{ id: 3, key: key(ENTRA, WS, "812") }] });
      }),
  );

  it.effect(
    "names the projects that live only in the snapshot, and deletes once they are confirmed",
    () =>
      Effect.gen(function* () {
        const onlyHere = {
          annotation_level: "notice",
          title: "nexi-snapshot-only-projects",
          message: '["notes","IES NG-9c436708"]',
        };
        const { flow } = yield* makeFlow({ caches: OWN, annotations: [onlyHere] });
        const info = yield* describeCloudSessionDelete(flow, context());
        assert.deepEqual(info.snapshotOnlyProjects, ["notes", "IES NG-9c436708"]);
        const message = yield* blockedBy({ caches: OWN, annotations: [onlyHere] });
        assert.match(message, /notes/);
        const confirmed = yield* makeFlow({ caches: OWN, annotations: [onlyHere] });
        yield* deleteCloudSession(confirmed.flow, context(), ["notes", "IES NG-9c436708"]);
        assert.deepEqual([...confirmed.deleted].sort(), [1, 2]);
      }),
  );

  it.effect("refuses when the machine reported its checkout was not saved", () =>
    Effect.gen(function* () {
      const lost = {
        annotation_level: "warning",
        title: "",
        message: "Could not push the session's checkout; it is lost with this VM.",
      };
      const message = yield* blockedBy({ caches: OWN, annotations: [lost] });
      assert.match(message, /Could not push/);
    }),
  );

  it.effect("deletes a session this user started and refuses someone else's", () =>
    Effect.gen(function* () {
      const foreign = { ...run(222, "completed"), actor: "someone-else" };
      const { flow } = yield* makeFlow({ runs: [run(111, "completed"), foreign] });
      const owned = yield* findSessionForDelete(flow, { sessionId: "111" });
      assert.equal(owned.runId, 111);
      assert.equal(owned.kind, "run");
      const error = yield* Effect.flip(findSessionForDelete(flow, { sessionId: "222" }));
      assert.equal(error.reason, "unknown_session");
      assert.equal(error.message, "That session does not exist.");
    }),
  );
});
