import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import {
  inspectCodexThreadHistory,
  repairCodexThreadHistory,
} from "../provider/Drivers/CodexHistoryRepair.ts";
import type { CodexHistoryRepairInput } from "../provider/Drivers/CodexHistoryRepairTypes.ts";

const threadFlag = Flag.string("thread").pipe(
  Flag.withDescription("Provider Codex thread id to inspect or repair."),
);
const homeFlag = Flag.string("home").pipe(
  Flag.withDescription("Codex home directory. Defaults to CODEX_HOME or ~/.codex."),
  Flag.optional,
);
const cwdFlag = Flag.string("cwd").pipe(
  Flag.withDescription("Working directory used to resolve a relative Codex home path."),
  Flag.optional,
);
const dryRunFlag = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Show the repair plan without changing provider history."),
  Flag.withDefault(false),
);

function repairInput(flags: {
  readonly thread: string;
  readonly home: Option.Option<string>;
  readonly cwd: Option.Option<string>;
  readonly dryRun?: boolean;
}): CodexHistoryRepairInput {
  const homePath = Option.getOrUndefined(flags.home);
  const cwd = Option.getOrUndefined(flags.cwd);
  return {
    providerThreadId: flags.thread,
    ...(homePath ? { homePath } : {}),
    ...(cwd ? { cwd } : {}),
    ...(flags.dryRun === true ? { dryRun: true } : {}),
  };
}

const inspectCommand = Command.make("inspect", {
  thread: threadFlag,
  home: homeFlag,
  cwd: cwdFlag,
}).pipe(
  Command.withDescription("Inspect a Codex rollout for incompatible persisted history."),
  Command.withHandler((flags) =>
    inspectCodexThreadHistory(repairInput(flags)).pipe(
      Effect.flatMap((report) => Console.log(JSON.stringify(report, null, 2))),
    ),
  ),
);

const repairCommand = Command.make("repair", {
  thread: threadFlag,
  home: homeFlag,
  cwd: cwdFlag,
  dryRun: dryRunFlag,
}).pipe(
  Command.withDescription("Back up and repair safe Codex rollout history incompatibilities."),
  Command.withHandler((flags) =>
    repairCodexThreadHistory(repairInput(flags)).pipe(
      Effect.flatMap((report) => Console.log(JSON.stringify(report, null, 2))),
    ),
  ),
);

export const codexHistoryCommand = Command.make("codex-history").pipe(
  Command.withDescription("Inspect or repair persisted Codex rollout history."),
  Command.withSubcommands([inspectCommand, repairCommand]),
);
