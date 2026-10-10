import * as Effect from "effect/Effect";
import {
  listImplementedT3TeamToolCatalogEntries,
  type T3TeamImplementedToolId,
} from "@t3tools/project-context/t3teamToolCatalog";

import { type T3TeamToolCallResult, type T3TeamResourceReadResult } from "./t3team-toolBroker.ts";

type T3TeamBrokerToolSpec = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: unknown;
};

export const TOOL_SPECS = Object.fromEntries(
  listImplementedT3TeamToolCatalogEntries().map((tool) => [
    tool.id,
    {
      name: tool.id,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    } satisfies T3TeamBrokerToolSpec,
  ]),
) as Readonly<Record<T3TeamImplementedToolId, T3TeamBrokerToolSpec>>;

const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * MCP `structuredContent` is validated as `Schema.Json`, which rejects an `undefined`-valued key
 * (e.g. `{ pendingKind: undefined }`) and fails the whole CallToolResult. The text block already
 * drops those keys via `JSON.stringify`, so derive the structured payload from the same text.
 */
const toJsonValue = (text: string | undefined, fallback: unknown) =>
  text === undefined ? fallback : (JSON.parse(text) as unknown);

export const okResult = (value: unknown): T3TeamToolCallResult => {
  const text = jsonText(value);
  return {
    content: [{ type: "text", text }],
    structuredContent: toJsonValue(text, value),
  };
};

export const errorResult = (message: string): T3TeamToolCallResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
  structuredContent: { error: message },
});

export const resourceResult = (uri: string, value: unknown): T3TeamResourceReadResult => ({
  contents: [{ uri, mimeType: "application/json", text: jsonText(value) }],
});

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const foldResult = <A, E>(
  effect: Effect.Effect<A, E>,
  onSuccess: (value: A) => T3TeamToolCallResult,
  onFailure: (message: string) => T3TeamToolCallResult,
) =>
  effect.pipe(
    Effect.result,
    Effect.map((exit) =>
      exit._tag === "Failure" ? onFailure(errorMessage(exit.failure)) : onSuccess(exit.success),
    ),
  );

export const foldResource = <A, E>(
  effect: Effect.Effect<A, E>,
  uri: string,
  onSuccess: (value: A) => T3TeamResourceReadResult,
) =>
  effect.pipe(
    Effect.result,
    Effect.map((exit) =>
      exit._tag === "Failure"
        ? resourceResult(uri, { error: `Failed to read resource: ${errorMessage(exit.failure)}` })
        : onSuccess(exit.success),
    ),
  );

const readRenameTitle = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return undefined;
  }
  const rawTitle = (value as { readonly title?: unknown }).title;
  if (typeof rawTitle !== "string") {
    return undefined;
  }
  const title = rawTitle.trim();
  return title.length > 0 ? title : undefined;
};

export const readBacklogAssigneeFilterMode = (value: unknown): "current-user" | undefined => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return undefined;
  }

  const rawMode = (value as { readonly mode?: unknown }).mode;
  return rawMode === "current-user" ? rawMode : undefined;
};
