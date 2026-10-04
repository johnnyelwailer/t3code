import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { makeChildWaitIndex } from "./t3team-childWaitIndex.ts";
import { makeResolveWait } from "./t3team-childWaitResolve.ts";
import type { ChildWaitRecord } from "./t3team-childWait.ts";

describe("child wait usage refresh", () => {
  it.effect("claims a terminal resolution before a concurrent deadline can send a timeout", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const commands: Array<{ type: string; text?: string }> = [];
      const index = makeChildWaitIndex();
      const record = {
        waitId: "wait",
        parentThreadId: "parent",
        childThreadId: "child",
        childTitle: "Child",
        on: "terminal",
        registeredAt: "2026-10-04T00:00:00Z",
        deadlineIso: "2026-10-04T00:00:01Z",
      } as unknown as ChildWaitRecord;
      index.add(record);
      const resolve = makeResolveWait({
        index,
        rearm: async () => {},
        engine: {
          dispatch: (command: (typeof commands)[number]) =>
            Effect.sync(() => {
              commands.push(command);
            }),
        } as unknown as OrchestrationEngineShape,
        query: {
          getThreadShellById: () => Effect.succeed(Option.none()),
        } as unknown as ProjectionSnapshotQueryShape,
        usageLine: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as("\n[provider-usage] fresh"),
          ),
      });
      const terminal = yield* resolve(record, "completed").pipe(Effect.forkChild);
      yield* Deferred.await(started);
      expect(index.due(Date.parse("2026-10-04T00:00:02Z"))).toEqual([]);
      // A deadline callback may have captured the record before the claim.
      yield* resolve(record, "timeout");
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(terminal);
      const messages = commands.filter((command) => command.type === "thread.actor.message");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.text).toContain("reached completed");
      expect(messages[0]?.text).toContain("[provider-usage] fresh");
    }),
  );
});
