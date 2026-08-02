import * as Schema from "effect/Schema";

import { decodeWithSchema } from "@runbook/core/schema";

export { createToolCalls, type ToolCallsDeps } from "./durableCalls.ts";

export interface ToolGroupRef<Id extends string = string> {
  readonly kind: "tool-group";
  readonly id: Id;
  readonly label: string;
  readonly description: string;
}

export interface ToolLogger {
  readonly info: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
}

export interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface ToolWorkspace {
  readonly readText: (relativePath: string) => Promise<string>;
  readonly writeText: (relativePath: string, content: string) => Promise<void>;
  readonly exists: (relativePath: string) => Promise<boolean>;
}

export type ToolCall = (ref: AnyToolRef, args: unknown) => Promise<unknown>;

export interface ToolHandlerContext<Call extends ToolCall = ToolCall> {
  readonly runId?: string;
  readonly workspaceRoot: string;
  readonly log: ToolLogger;
  readonly fetch: FetchLike;
  readonly workspace: ToolWorkspace;
  /** Adapter-specific integrations belong behind this open extension point. */
  readonly extensions?: unknown;
  readonly callTool: Call;
}

export interface ToolRef<
  I,
  R,
  Id extends string = string,
  Group extends ToolGroupRef = ToolGroupRef,
  Context = ToolHandlerContext,
> {
  (args: I): Promise<R>;
  readonly kind: "tool";
  readonly id: Id;
  readonly group: Group;
  readonly args: Schema.Schema<I>;
  readonly result: Schema.Schema<R>;
  readonly handler: (args: I, ctx: Context) => Promise<R>;
}

export type AnyToolRef<Context = ToolHandlerContext> = ToolRef<
  unknown,
  unknown,
  string,
  ToolGroupRef,
  Context
>;

export function createToolGroup<const Id extends string>(opts: {
  readonly id: Id;
  readonly label: string;
  readonly description: string;
}): ToolGroupRef<Id> {
  return Object.freeze({ kind: "tool-group" as const, ...opts });
}

/** Author-facing alias; registration/dispatch remains a host concern. */
export const defineToolGroup = createToolGroup;

export function createToolRef<
  I,
  R,
  const Id extends string,
  Group extends ToolGroupRef,
  Context,
>(opts: {
  readonly id: Id;
  readonly group: Group;
  readonly args: Schema.Schema<I>;
  readonly result: Schema.Schema<R>;
  readonly handler: (args: I, ctx: Context) => Promise<R>;
  readonly dispatch: (ref: ToolRef<I, R, Id, Group, Context>, args: I) => Promise<R>;
}): ToolRef<I, R, Id, Group, Context> {
  let ref!: ToolRef<I, R, Id, Group, Context>;
  const callable = (args: I): Promise<R> => opts.dispatch(ref, args);
  ref = Object.freeze(
    Object.assign(callable, {
      kind: "tool" as const,
      id: opts.id,
      group: opts.group,
      args: opts.args,
      result: opts.result,
      handler: opts.handler,
    }),
  ) as ToolRef<I, R, Id, Group, Context>;
  return ref;
}

/** Author-facing alias; unlike the T3Team adapter this does not touch a global registry. */
export const defineTool = createToolRef;

export async function executeToolHandler<
  I,
  R,
  Id extends string,
  Group extends ToolGroupRef,
  Context,
>(ref: ToolRef<I, R, Id, Group, Context>, args: unknown, ctx: Context): Promise<R> {
  const validatedArgs = await decodeWithSchema(
    ref.args,
    args,
    `Invalid arguments for tool '${ref.id}'`,
  );
  const result = await ref.handler(validatedArgs, ctx);
  return await decodeWithSchema(ref.result, result, `Invalid result for tool '${ref.id}'`);
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;
type SnakeToCamelCase<Value extends string> = Value extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<SnakeToCamelCase<Tail>>}`
  : Value;
type DotPathTree<Path extends string, Value> = Path extends `${infer Head}.${infer Tail}`
  ? { readonly [K in SnakeToCamelCase<Head>]: DotPathTree<Tail, Value> }
  : { readonly [K in SnakeToCamelCase<Path>]: Value };

export type ToolTreeFromRefs<TRefs extends readonly unknown[]> = [TRefs[number]] extends [never]
  ? {}
  : Simplify<
      UnionToIntersection<
        TRefs[number] extends infer TRef
          ? TRef extends { readonly id: infer Id extends string }
            ? DotPathTree<Id, TRef>
            : never
          : never
      >
    >;
