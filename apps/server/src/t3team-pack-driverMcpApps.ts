/**
 * MCP Apps for MCP servers a pack provider connects itself (`@t3team/pack-api` `mcp-apps.ts`):
 * the host vocabulary a session receives, and the session's app requests as the host
 * `ProviderAdapterV2McpApps`. Items are completed in `t3team-pack-driverMcpAppCapture.ts`.
 *
 * @module t3team-pack-driverMcpApps
 */
import type { PackMcpApps, PackMcpAppsHost } from "@t3team/pack-api";
import type { ProviderDriverKind, ThreadId } from "@t3tools/contracts";
import {
  MCP_APP_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  type McpAppReference,
} from "@t3tools/shared/mcpApp";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Predicate from "effect/Predicate";

import {
  ProviderAdapterProtocolError,
  type ProviderAdapterV2McpApps,
} from "@t3tools/provider-core/server/ProviderAdapter";
import { ServerConfig } from "./config.ts";
import { snapshotMcpApp } from "./mcpApps/McpAppSnapshot.ts";
import { packCall } from "./t3team-pack-driverCall.ts";

export const PACK_MCP_APPS_HOST: PackMcpAppsHost = {
  clientCapabilities: {
    extensions: { [MCP_APP_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] } },
  },
  toolVisibleToModel: (meta) => {
    const visibility =
      Predicate.isObject(meta) && Predicate.isObject(meta.ui) ? meta.ui.visibility : undefined;
    return !Array.isArray(visibility) || visibility.includes("model");
  },
};

/** Stores an app document as a thread attachment (`McpAppSnapshot.ts`). */
export type PackMcpAppSnapshot = (input: {
  readonly threadId: ThreadId;
  readonly server: string;
  readonly tool: string;
  readonly resourceUri: string;
  readonly contents: ReadonlyArray<unknown>;
}) => Effect.Effect<McpAppReference | undefined, PlatformError.PlatformError>;

/**
 * The snapshot writer of the ambient driver context. Absent outside a server (tests,
 * non-provider hosts): the host then offers no MCP Apps to the pack.
 */
export const packMcpAppSnapshotFrom = (
  ambient: Context.Context<never>,
): PackMcpAppSnapshot | undefined => {
  const config = Context.getOption(ambient, ServerConfig);
  const fileSystem = Context.getOption(ambient, FileSystem.FileSystem);
  if (Option.isNone(config) || Option.isNone(fileSystem)) return undefined;
  return (input) =>
    snapshotMcpApp({ ...input, attachmentsDir: config.value.attachmentsDir }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem.value),
    );
};

export const makePackMcpApps = (
  mcpApps: PackMcpApps,
  driver: ProviderDriverKind,
): ProviderAdapterV2McpApps => {
  const bridge = (detail: string) =>
    packCall((cause) => new ProviderAdapterProtocolError({ driver, detail, payload: cause }));
  return {
    listTools: ({ providerThread, server }) =>
      bridge("Pack MCP tool listing failed.").call(() =>
        mcpApps.listTools({ providerThreadId: providerThread.id, server }),
      ),
    callTool: ({ providerThread, server, tool, arguments: args }) =>
      bridge("Pack MCP tool call failed.").call(() =>
        mcpApps.callTool({ providerThreadId: providerThread.id, server, tool, arguments: args }),
      ),
    readResource: ({ providerThread, server, uri }) =>
      bridge("Pack MCP resource read failed.").call(() =>
        mcpApps.readResource({ providerThreadId: providerThread.id, server, uri }),
      ),
  };
};
