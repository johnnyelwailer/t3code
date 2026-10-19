/**
 * A simulated Jira project and the TestClock plumbing shared by the mirror sync
 * walk tests.
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";

import type { MirrorPageSource } from "./t3team-atlassian-mirrorSyncPageWalk.ts";

export const minuteMs = 60_000;
export const dayMs = 24 * 60 * minuteMs;
export const jiraNowMs = Date.UTC(2026, 9, 12, 12);
export const account = { id: "https://catch-up.atlassian.net", provider: "atlassian" };
export const request = { account, externalProjectId: "IES" };
export const identity = { provider: "atlassian", accountId: account.id, externalProjectId: "IES" };
export const notSuperseded = () => false;

export type FakeIssue = {
  readonly id: string;
  readonly displayId: string;
  readonly updatedAt: string;
};

export const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

export type PageCall = {
  readonly updatedWithinMinutes: number | undefined;
  readonly newestFirst: boolean;
};

/**
 * A Jira project answering `updated >= -Nm ORDER BY updated ASC|DESC` with offset
 * cursors (issues are given oldest first). `failCall` makes that (1-based) call throw `failure`.
 */
export function fakeJira(
  issues: ReadonlyArray<FakeIssue>,
  options: { readonly failCall?: number; readonly failure?: unknown } = {},
) {
  const calls: Array<PageCall> = [];
  const source: MirrorPageSource = {
    listProjectMirrorPage: async (input) => {
      calls.push({
        updatedWithinMinutes: input.updatedWithinMinutes,
        newestFirst: input.newestFirst === true,
      });
      if (calls.length === options.failCall) throw options.failure ?? new Error("Jira is down");
      const cutoffMs = input.updatedWithinMinutes
        ? jiraNowMs - input.updatedWithinMinutes * minuteMs
        : Number.NEGATIVE_INFINITY;
      const inWindow = issues.filter((issue) => Date.parse(issue.updatedAt) >= cutoffMs);
      const matching = input.newestFirst ? inWindow.toReversed() : inWindow;
      const offset = Number(input.cursor ?? 0);
      const end = offset + (input.limit ?? 100);
      return {
        items: matching.slice(offset, end),
        nextCursor: end < matching.length ? String(end) : undefined,
      };
    },
  };
  return { source, calls };
}

/** Runs `effect` to completion while advancing the TestClock past its sleeps. */
export const settle = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(effect);
    for (let step = 0; step < 20_000 && fiber.pollUnsafe() === undefined; step++) {
      yield* TestClock.adjust("3 seconds");
      yield* TestClock.withLive(Effect.sleep("0 millis"));
    }
    return yield* Fiber.await(fiber);
  });

export const settleValue = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  settle(effect).pipe(
    Effect.flatMap((exit) =>
      Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.die(exit.cause),
    ),
  );

export const mirroredIds = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ issueId: string }>`
    SELECT issue_id AS "issueId" FROM t3team_atlassian_backlog_issues
    WHERE provider = ${identity.provider} AND account_id = ${identity.accountId}
      AND external_project_id = ${identity.externalProjectId}
  `;
  return new Set(rows.map((row) => row.issueId));
});

export const startAtJiraNow = TestClock.setTime(jiraNowMs);
