/**
 * Completes a pack `dynamic_tool` item that ran a pack-hosted MCP tool
 * (`@t3team/pack-api` `PackMcpToolCallOutput`): when the tool declares a `ui://` app, its
 * document is read through the session and stored, and the item's output becomes the app
 * reference beside the result — the shape every adapter gives the renderer. Any other call,
 * and any capture that fails, keeps the pack's plain text.
 *
 * The capture runs inline on the event stream, so the item and everything after it wait at
 * most {@link CAPTURE_TIMEOUT}; ordering, and with it the turn's terminal, stays intact.
 *
 * @module t3team-pack-driverMcpAppCapture
 */
import {
  PACK_MCP_TOOL_CALL_OUTPUT_KEY,
  type PackMcpApps,
  type PackMcpToolCall,
} from "@t3team/pack-api";
import type {
  OrchestrationV2TurnItem,
  ProviderDriverKind,
  ProviderThreadId,
} from "@t3tools/contracts";
import { MCP_APP_OUTPUT_KEY, readMcpAppResourceUri } from "@t3tools/shared/mcpApp";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

import {
  ProviderAdapterProtocolError,
  type ProviderAdapterV2Event,
} from "@t3tools/provider-core/server/ProviderAdapter";
import type { PackMcpAppSnapshot } from "./t3team-pack-driverMcpApps.ts";

const CAPTURE_TIMEOUT = "20 seconds";

type DynamicToolItem = Extract<OrchestrationV2TurnItem, { readonly type: "dynamic_tool" }>;

const readToolCall = (output: unknown): PackMcpToolCall | undefined => {
  const call = Predicate.isObject(output) ? output[PACK_MCP_TOOL_CALL_OUTPUT_KEY] : undefined;
  return Predicate.isObject(call) &&
    typeof call.server === "string" &&
    typeof call.tool === "string" &&
    Predicate.isObject(call.result) &&
    Array.isArray(call.result.content)
    ? {
        server: call.server,
        tool: call.tool,
        toolMeta: call.toolMeta,
        result: { ...call.result, content: call.result.content },
      }
    : undefined;
};

const plainText = (output: unknown): string | undefined =>
  Predicate.isObject(output) && typeof output.text === "string" ? output.text : undefined;

const withOutput = (item: DynamicToolItem, output: unknown): DynamicToolItem => {
  const { output: _pending, ...rest } = item;
  return output === undefined ? rest : { ...rest, output };
};

export const makePackMcpAppCapture = (input: {
  readonly mcpApps: PackMcpApps;
  readonly snapshot: PackMcpAppSnapshot;
  readonly driver: ProviderDriverKind;
}) => {
  const captureApp = (
    item: DynamicToolItem,
    providerThreadId: ProviderThreadId,
    call: PackMcpToolCall,
    resourceUri: string,
  ) =>
    Effect.tryPromise({
      try: () =>
        input.mcpApps.readResource({ providerThreadId, server: call.server, uri: resourceUri }),
      catch: (cause) =>
        new ProviderAdapterProtocolError({
          driver: input.driver,
          detail: "Pack MCP resource read failed.",
          payload: cause,
        }),
    }).pipe(
      Effect.flatMap(({ contents }) =>
        input.snapshot({
          threadId: item.threadId,
          server: call.server,
          tool: call.tool,
          resourceUri,
          contents,
        }),
      ),
      Effect.timeout(CAPTURE_TIMEOUT),
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) =>
          Effect.logWarning("Failed to capture a pack MCP app; showing a plain tool row.", {
            driver: input.driver,
            server: call.server,
            tool: call.tool,
            resourceUri,
            cause,
          }).pipe(Effect.as(undefined)),
      ),
      Effect.orDie,
    );

  const completeItem = Effect.fn("PackMcpAppCapture.completeItem")(function* (
    item: DynamicToolItem,
  ) {
    const call = readToolCall(item.output);
    if (call === undefined) return item;
    const text = plainText(item.output);
    const resourceUri = readMcpAppResourceUri(call.toolMeta);
    const providerThreadId = item.providerThreadId;
    if (
      item.status !== "completed" ||
      call.result.isError === true ||
      resourceUri === undefined ||
      providerThreadId === null
    ) {
      return withOutput(item, text);
    }
    const reference = yield* captureApp(item, providerThreadId, call, resourceUri);
    return withOutput(
      item,
      reference === undefined ? text : { [MCP_APP_OUTPUT_KEY]: reference, result: call.result },
    );
  });

  return (event: ProviderAdapterV2Event): Effect.Effect<ProviderAdapterV2Event> =>
    event.type === "turn_item.updated" && event.turnItem.type === "dynamic_tool"
      ? completeItem(event.turnItem).pipe(Effect.map((turnItem) => ({ ...event, turnItem })))
      : Effect.succeed(event);
};
