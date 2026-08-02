import * as Schema from "effect/Schema";

import { decodeWithSchema } from "@runbook/core/schema";

export { createScriptCalls, type ScriptCallsDeps } from "./durableCalls.ts";

export type ScriptCall = (ref: unknown, args: unknown) => Promise<unknown>;

export interface ScriptHandlerContext<Call extends ScriptCall = ScriptCall> {
  readonly runId: string;
  readonly workspaceRoot: string;
  readonly log: {
    readonly info: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
    readonly warn: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
    readonly error: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  };
  readonly fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly workspace: {
    readonly readText: (relativePath: string) => Promise<string>;
    readonly writeText: (relativePath: string, content: string) => Promise<void>;
    readonly exists: (relativePath: string) => Promise<boolean>;
  };
  readonly callTool: Call;
  /** Adapter-specific script facilities belong behind this open extension point. */
  readonly extensions?: unknown;
}

type BivariantCall<I, O> = { call(args: I): Promise<O> }["call"];

export type ScriptRef<I, O, Context = ScriptHandlerContext> = BivariantCall<I, O> & {
  readonly kind: "script";
  readonly replay: "default" | "never";
  readonly inputs: Schema.Schema<I>;
  readonly outputs: Schema.Schema<O>;
  handler(args: I, ctx: Context): Promise<O>;
};

export type AnyScriptRef<Context = ScriptHandlerContext> = ScriptRef<unknown, unknown, Context>;

export function createScriptRef<I, O, Context>(opts: {
  readonly inputs: Schema.Schema<I>;
  readonly outputs: Schema.Schema<O>;
  readonly handler: (args: I, ctx: Context) => Promise<O>;
  readonly replay?: "default" | "never";
  readonly dispatch: (ref: ScriptRef<I, O, Context>, args: I) => Promise<O>;
}): ScriptRef<I, O, Context> {
  let ref!: ScriptRef<I, O, Context>;
  const callable = (args: I): Promise<O> => opts.dispatch(ref, args);
  ref = Object.freeze(
    Object.assign(callable, {
      kind: "script" as const,
      replay: opts.replay ?? "default",
      inputs: opts.inputs,
      outputs: opts.outputs,
      handler: opts.handler,
    }),
  ) as ScriptRef<I, O, Context>;
  return ref;
}

export async function executeScriptHandler<I, O, Context>(
  ref: ScriptRef<I, O, Context>,
  args: unknown,
  ctx: Context,
): Promise<O> {
  const validatedArgs = await decodeWithSchema(ref.inputs, args, "Invalid arguments for script");
  const result = await ref.handler(validatedArgs, ctx);
  return await decodeWithSchema(ref.outputs, result, "Invalid result for script");
}

export type ScriptTreeFromRecord<TScripts extends Record<string, unknown>> = {
  readonly [K in keyof TScripts]: TScripts[K];
};
