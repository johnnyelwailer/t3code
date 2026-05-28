import * as Effect from "effect/Effect";
import {
  listImplementedT3workToolCatalogEntries,
  type T3workImplementedToolId,
} from "@t3tools/project-context/t3workToolCatalog";

import { type T3workToolCallResult, type T3workResourceReadResult } from "./t3work-toolBroker.ts";

type T3workBrokerToolSpec = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: unknown;
};

export const TOOL_SPECS = Object.fromEntries(
  listImplementedT3workToolCatalogEntries().map((tool) => [
    tool.id,
    {
      name: tool.id,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    } satisfies T3workBrokerToolSpec,
  ]),
) as Readonly<Record<T3workImplementedToolId, T3workBrokerToolSpec>>;

const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

export const okResult = (value: unknown): T3workToolCallResult => ({
  content: [{ type: "text", text: jsonText(value) }],
  structuredContent: value,
});

export const errorResult = (message: string): T3workToolCallResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
  structuredContent: { error: message },
});

export const resourceResult = (uri: string, value: unknown): T3workResourceReadResult => ({
  contents: [{ uri, mimeType: "application/json", text: jsonText(value) }],
});

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const foldResult = <A, E>(
  effect: Effect.Effect<A, E>,
  onSuccess: (value: A) => T3workToolCallResult,
  onFailure: (message: string) => T3workToolCallResult,
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
  onSuccess: (value: A) => T3workResourceReadResult,
) =>
  effect.pipe(
    Effect.result,
    Effect.map((exit) =>
      exit._tag === "Failure"
        ? resourceResult(uri, { error: `Failed to read resource: ${errorMessage(exit.failure)}` })
        : onSuccess(exit.success),
    ),
  );

export const readRenameTitle = (value: unknown): string | undefined => {
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
