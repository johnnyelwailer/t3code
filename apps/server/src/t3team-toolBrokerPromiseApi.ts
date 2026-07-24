import * as Effect from "effect/Effect";

import {
  T3TEAM_MCP_SERVER_NAME,
  type T3TeamBoundToolSurface,
  type T3TeamResourceReadResult,
  type T3TeamToolCallResult,
} from "./t3team-toolBroker.ts";

function toolResultDetail(result: T3TeamToolCallResult): string {
  return result.content
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join("\n");
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseResourceValue(result: T3TeamResourceReadResult): unknown {
  const text = result.contents[0]?.text ?? "null";
  const value = parseJsonText(text);
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    throw new Error(value.error);
  }
  return value;
}

export function createT3TeamPromiseToolApi(input: {
  readonly binding: T3TeamBoundToolSurface;
  readonly runPromise: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>;
}) {
  return {
    call: async <T = unknown>(name: string, toolInput?: Record<string, unknown>) => {
      const result = await input.runPromise(
        input.binding.callTool({
          server: T3TEAM_MCP_SERVER_NAME,
          tool: name,
          ...(toolInput ? { arguments: toolInput } : {}),
        }),
      );
      if (result.isError) {
        throw new Error(toolResultDetail(result) || `Tool '${name}' failed.`);
      }
      return (result.structuredContent ?? parseJsonText(result.content[0]?.text ?? "null")) as T;
    },
    readResource: async (uri: string) =>
      parseResourceValue(
        await input.runPromise(
          input.binding.readResource({
            server: T3TEAM_MCP_SERVER_NAME,
            uri,
          }),
        ),
      ),
  };
}

export function createUnavailableT3TeamPromiseToolApi(scopeLabel: string) {
  return {
    call: async (name: string) => {
      throw new Error(`Recipe tool '${name}' is not available ${scopeLabel}.`);
    },
    readResource: async (uri: string) => {
      throw new Error(`Recipe resource '${uri}' is not available ${scopeLabel}.`);
    },
  };
}
