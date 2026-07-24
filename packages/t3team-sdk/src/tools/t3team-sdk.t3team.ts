import * as Schema from "effect/Schema";

import { t3teamThreadWrite } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";

export const RenameThreadToolArgs = Schema.Struct({
  title: Schema.String,
});
export type RenameThreadToolArgs = typeof RenameThreadToolArgs.Type;

export const RenameThreadToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  title: Schema.String,
  threadId: Schema.optional(Schema.String),
});
export type RenameThreadToolResult = typeof RenameThreadToolResult.Type;

export const renameThreadTool = defineTool({
  id: "t3team.thread.rename",
  group: t3teamThreadWrite,
  args: RenameThreadToolArgs,
  result: RenameThreadToolResult,
  handler: async (args, ctx) => {
    const title = args.title.trim();
    if (title.length === 0) {
      throw new Error("t3team.thread.rename requires a non-empty 'title'.");
    }
    if (!ctx.t3team) {
      throw new Error("t3team.thread.rename requires a t3team tool client in ToolHandlerCtx.");
    }
    return await ctx.t3team.renameThread({ title });
  },
});
