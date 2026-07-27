import type { ScriptRef, ToolRef } from "./t3team-sdk.types.ts";

/**
 * Every kind a journal line can carry, in ONE place: the {@link PrimitiveKind} union and the
 * read-side `Schema.Literals` validator in `t3team-sdk.journalReader.ts` are both derived from
 * this list, so a new primitive cannot be writable-but-unreadable.
 */
export const PRIMITIVE_KINDS = [
  "tool",
  "script",
  "script-never",
  "now",
  "random",
  "uuid",
  "wait",
  "parallel",
  "pipeline",
  "workflow",
  "thread.create",
  "thread.turn",
  "thread.message",
  "user.input",
  "wait.until",
  "model.resolve",
] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

export interface PrimitiveCall<R> {
  readonly kind: PrimitiveKind;
  readonly refId: string;
  readonly args: unknown;
  readonly replay?: "default" | "never";
  readonly exec: () => Promise<R>;
  readonly decodeRecorded?: (recorded: unknown) => R | Promise<R>;
}

export type WorkflowRuntime = {
  readonly callTool: <I, R>(ref: ToolRef<I, R>, args: I) => Promise<R>;
  readonly callScript: <I, O>(ref: ScriptRef<I, O>, args: I) => Promise<O>;
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly now: () => number;
  readonly random: () => number;
  readonly uuid: () => string;
};
