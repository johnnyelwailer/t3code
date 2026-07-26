/**
 * Type-level derivation of the tool/script trees a workflow body sees.
 *
 * A tool declares a dotted id (`jira.issue.search`) and the body reaches it as a nested property
 * (`tools.jira.issue.search`), so the tree has to be derived from the ids at the type level — that is
 * what `DotPathTree` + `UnionToIntersection` do here, with snake_case segments camelised to match how
 * the runtime builds the same tree.
 *
 * Extracted from `t3team-sdk.types.ts` (which reached the 200-line cap): these are purely mechanical
 * type utilities with no relation to the ref SHAPES next to them, and the split keeps each file about
 * one thing. Both are re-exported from `t3team-sdk.types.ts`, so importers are unaffected.
 */

import type { AnyScriptRef } from "./t3team-sdk.types.ts";

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
  ? { [K in SnakeToCamelCase<Head>]: DotPathTree<Tail, Value> }
  : { [K in SnakeToCamelCase<Path>]: Value };

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

export type ScriptTreeFromRecord<TScripts extends Record<string, AnyScriptRef>> = {
  readonly [K in keyof TScripts]: TScripts[K];
};
