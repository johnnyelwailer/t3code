import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { ProjectService } from "../project/ProjectService.ts";
import { CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";
import { NexiBrokerService } from "./t3team-NexiBrokerService.ts";

/**
 * Warm-pool demand (#562 option B): while this server runs, it tells the broker which of its
 * projects have a machine definition, so each gets a warm standby — automatically, as soon as a
 * project is here, and none once no server with it is running (the broker lets a report lapse
 * after 30 minutes). Starting a session reports its project at once
 * (`t3team-CloudSessionService.ts`). A failed report is retried on the next round, never surfaced.
 */
const REPORT_EVERY = "10 minutes";
/** The broker takes at most this many projects per report. */
const MAX_REPORTED = 200;

/** The pool keys of this server's projects that have a machine (de-duplicated). */
export const projectPoolKeys = Effect.gen(function* () {
  const projects = yield* ProjectService;
  const machines = yield* CloudSessionMachines;
  const shells = yield* projects.listShells();
  const keys = new Set<string>();
  for (const shell of shells) {
    const key = yield* machines.poolKeyOf(shell.id);
    if (key !== null) keys.add(key);
  }
  return [...keys].slice(0, MAX_REPORTED);
});

export const StandbyInterestLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const broker = yield* NexiBrokerService;
    if (!broker.enabled) return;
    const report = projectPoolKeys.pipe(
      Effect.flatMap((keys) => (keys.length === 0 ? Effect.void : broker.reportInterest(keys))),
      Effect.ignore,
    );
    yield* report.pipe(Effect.repeat(Schedule.spaced(REPORT_EVERY)), Effect.forkScoped);
  }),
);
