/**
 * The advertised `tools/list` text is minimal: a bullet list per tool and a short note on a field
 * only where its name is not self-evident. The original description and field docs are kept
 * as registered, and `t3_tool_help` returns them on demand, so nothing is lost.
 *
 * A tool with an entry in the tables gets its description replaced and every schema field
 * description dropped except the ones the entry names. A tool without one is advertised as
 * registered; `t3team-toolDocs.test.ts` fails when it exceeds a cap.
 */
import * as Effect from "effect/Effect";
import { McpSchema, McpServer } from "effect/ai";

import { FORK_TOOL_DOCS } from "./t3team-toolDocs-fork.ts";
import { UPSTREAM_TOOL_DOCS } from "./t3team-toolDocs-upstream.ts";

export interface MinimalToolDocs {
  readonly description: string;
  /** Field notes by property name, applied wherever that property appears in the tool's schema. */
  readonly fields?: Readonly<Record<string, string>>;
}

export type ToolDocsTable = Readonly<Record<string, MinimalToolDocs>>;

export const TOOL_DESCRIPTION_CAP_BYTES = 250;
export const FIELD_DESCRIPTION_CAP_BYTES = 60;

export const MINIMAL_TOOL_DOCS: ToolDocsTable = { ...FORK_TOOL_DOCS, ...UPSTREAM_TOOL_DOCS };

export interface ToolDocs {
  readonly description?: string | undefined;
  readonly inputSchema: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const originals = new Map<string, ToolDocs>();

export const originalToolDocs = (name: string): ToolDocs | undefined => originals.get(name);

/** Every field description of a schema, by property name (the first one wins for a repeated name). */
export function fieldDescriptionsByName(schema: unknown): Record<string, string> {
  const found: Record<string, string> = {};
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && isObject(value)) {
        for (const [name, property] of Object.entries(value)) {
          if (isObject(property) && typeof property.description === "string")
            found[name] ??= property.description;
          visit(property);
        }
      } else visit(value);
    }
  };
  visit(schema);
  return found;
}

/** `schema` without field descriptions, except the notes in `keep`, which replace them. */
export function withFieldNotes(schema: unknown, keep: Readonly<Record<string, string>>): unknown {
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

export const stripFieldDescriptions = (schema: unknown) => withFieldNotes(schema, {});
