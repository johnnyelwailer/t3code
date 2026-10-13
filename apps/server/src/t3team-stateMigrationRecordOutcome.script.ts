/**
 * The `migrate-project-state` recipe's `recordOutcome` script: merges the run's outcome into the
 * state-migration record the app polls. Scaffolded into
 * `<state dir>/recipes/migrate-project-state/scripts/recordOutcome.ts`.
 *
 * Writes through the run's workspace (the receiving checkout), and only into the record of its own
 * migration: a record a later switch replaced is left alone.
 */
import { DateTime, Schema } from "effect";
import { defineScript } from "@t3team/sdk";

const decodeRecord = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

export default defineScript({
  inputs: Schema.Struct({
    recordPath: Schema.String,
    migrationId: Schema.String,
    outcome: Schema.Literals(["completed", "failed"]),
    summary: Schema.optional(Schema.String),
    conflicts: Schema.optional(Schema.Number),
    pullRequestUrl: Schema.optional(Schema.String),
    error: Schema.optional(Schema.String),
  }),
  outputs: Schema.Struct({ recorded: Schema.Boolean }),
  handler: async (args, ctx) => {
    if (!(await ctx.workspace.exists(args.recordPath))) return { recorded: false };
    const current = decodeRecord(await ctx.workspace.readText(args.recordPath));
    if (current._tag === "None" || current.value.migrationId !== args.migrationId) {
      return { recorded: false };
    }
    const { recordPath: _recordPath, outcome, ...patch } = args;
    const next = {
      ...current.value,
      ...patch,
      status: outcome,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    };
    await ctx.workspace.writeText(args.recordPath, `${JSON.stringify(next, null, 2)}\n`);
    return { recorded: true };
  },
});
