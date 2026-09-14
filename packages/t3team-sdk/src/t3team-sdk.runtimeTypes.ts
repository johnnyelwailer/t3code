import { PRIMITIVE_KINDS as CORE_PRIMITIVE_KINDS } from "@runbook/core/primitiveKinds";
import type { ScriptRef, ToolRef } from "./t3team-sdk.types.ts";
import type {
  PrimitiveCall as GenericPrimitiveCall,
  PrimitiveRuntime,
} from "@runbook/core/runtimeTypes";

/**
 * Every kind a journal line can carry, in ONE place: the {@link PrimitiveKind} union and the
 * read-side `Schema.Literals` validator in `t3team-sdk.journalReader.ts` are both derived from
 * this list, so a new primitive cannot be writable-but-unreadable. The core kinds (tool,
 * script, deterministic, composition, artifact, usage) come from `@runbook/core`; the SDK
 * adds only its host-specific handle kinds.
 */
export const PRIMITIVE_KINDS = [
  ...CORE_PRIMITIVE_KINDS,
  "thread.create",
  "thread.turn",
  "thread.message",
  "user.input",
  "model.resolve",
] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/** Keep the SDK's historical literal kind surface over core's open generic contract. */
export type PrimitiveCall<R> = Omit<GenericPrimitiveCall<R>, "kind"> & {
  readonly kind: PrimitiveKind;
};

export type WorkflowRuntime = Omit<PrimitiveRuntime, "callPrimitive"> & {
  readonly callPrimitive: <R>(call: PrimitiveCall<R>) => Promise<R>;
  readonly callTool: <I, R>(ref: ToolRef<I, R>, args: I) => Promise<R>;
  readonly callScript: <I, O>(ref: ScriptRef<I, O>, args: I) => Promise<O>;
};
