/**
 * The advertised `tools/list` text is minimal: a bullet list per tool and a short note on a field
 * only where its name is not self-evident. The original description and field docs are kept
 * as registered, and `t3_tool_help` returns them on demand.
 *
 * Models rarely ask for what was cut (8 of 182 gateway runs), so the rule is: enum values, op
 * and mode names, companion arguments and the short meaning of each value stay (`placement:
 * side=compact|main=grouped|footer=collapsed`); only prose, examples and rationale go.
 *
 * A tool with an entry in the tables gets its description replaced and every schema field
 * description dropped except the ones the entry names. A tool without one is advertised as
 * registered; `AgentContextBudget.test.ts` fails when a fork tool exceeds a cap.
 */
import * as Effect from "effect/Effect";
import { McpSchema, McpServer } from "effect/ai";

import { FORK_TOOL_DOCS } from "./t3team-toolDocs-fork.ts";

export interface MinimalToolDocs {
  readonly description: string;
  /** Field notes by property name, applied wherever that property appears in the tool's schema. */
  readonly fields?: Readonly<Record<string, string>>;
}

export type ToolDocsTable = Readonly<Record<string, MinimalToolDocs>>;

export const TOOL_DESCRIPTION_CAP_BYTES = 250;
export const FIELD_DESCRIPTION_CAP_BYTES = 60;

/** Only the fork's own tools: upstream tool text is advertised as registered. */
export const MINIMAL_TOOL_DOCS: ToolDocsTable = FORK_TOOL_DOCS;

export interface ToolDocs {
  readonly description?: string | undefined;
  readonly inputSchema: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const originals = new Map<string, ToolDocs>();

export const originalToolDocs = (name: string): ToolDocs | undefined => originals.get(name);

/** Every description in a schema by its path, e.g. `schedule.filters[]`; the top level is `(input)`. */
export function fieldDescriptionsByPath(schema: unknown): Record<string, string> {
  const found: Record<string, string> = {};
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((item) => visit(item, path));
    if (!isObject(node)) return;
    if (typeof node.description === "string") found[path || "(input)"] ??= node.description;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && isObject(value)) {
        for (const [name, property] of Object.entries(value))
          visit(property, path === "" ? name : `${path}.${name}`);
      } else if (key === "items") visit(value, `${path}[]`);
      else if (key !== "description") visit(value, path);
    }
  };
  visit(schema, "");
  return found;
}

/** `schema` without field descriptions, except the notes in `keep`, which replace them. */
function withFieldNotes(schema: unknown, keep: Readonly<Record<string, string>>): unknown {
  if (Array.isArray(schema)) return schema.map((item) => withFieldNotes(item, keep));
  if (!isObject(schema)) return schema;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "description" && typeof value === "string") continue;
    result[key] =
      key === "properties" && isObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([name, property]) => {
              const trimmed = withFieldNotes(property, keep);
              return [
                name,
                keep[name] !== undefined && isObject(trimmed)
                  ? { ...trimmed, description: keep[name] }
                  : trimmed,
              ];
            }),
          )
        : withFieldNotes(value, keep);
  }
  return result;
}

/** Records the tool as registered and returns the minimal text its entry asks for. */
export function advertiseToolDocs<
  T extends {
    readonly name: string;
    readonly description?: string | undefined;
    readonly inputSchema: unknown;
  },
>(original: T, table: ToolDocsTable = MINIMAL_TOOL_DOCS): Pick<T, "description" | "inputSchema"> {
  originals.set(original.name, {
    description: original.description,
    inputSchema: original.inputSchema,
  });
  const docs = table[original.name];
  return docs === undefined
    ? { description: original.description, inputSchema: original.inputSchema }
    : {
        description: docs.description,
        // Only descriptions change, so the schema keeps the tool's own type.
        inputSchema: withFieldNotes(original.inputSchema, docs.fields ?? {}) as T["inputSchema"],
      };
}

/** Registers every tool added inside `registration` with the minimal text its entry asks for. */
export const withMinimalToolDocs = Effect.fnUntraced(function* <A, E, R>(
  registration: Effect.Effect<A, E, R>,
) {
  const server = yield* McpServer.McpServer;
  const minimalServer = McpServer.McpServer.of({
    ...server,
    addTool: Effect.fn("McpServer.addTool")(function (options) {
      return server.addTool({
        ...options,
        tool: new McpSchema.Tool({ ...options.tool, ...advertiseToolDocs(options.tool) }),
      });
    }),
  });
  return yield* registration.pipe(Effect.provideService(McpServer.McpServer, minimalServer));
});
