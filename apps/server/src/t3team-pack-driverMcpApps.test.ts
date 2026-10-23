import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import type { PackMcpApps } from "@t3team/pack-api";
import { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { snapshotMcpApp } from "./mcpApps/McpAppSnapshot.ts";
import { NOW, PACK_DRIVER } from "./t3team-pack-driver.fixtures.ts";
import { PackCodec } from "./t3team-pack-driverCodec.ts";
import { makePackMcpAppCapture } from "./t3team-pack-driverMcpAppCapture.ts";
import { PACK_MCP_APPS_HOST, type PackMcpAppSnapshot } from "./t3team-pack-driverMcpApps.ts";

const driver = ProviderDriverKind.make(PACK_DRIVER);
const RESULT = { content: [{ type: "text", text: "3 projects, 1 stale" }] };
const DASHBOARD_HTML = "<!doctype html><html><body>IES dashboard</body></html>";

const decodeEvent = Schema.decodeUnknownSync(PackCodec.event);

const toolItemEvent = (input: { readonly toolMeta?: unknown; readonly status?: string }) =>
  decodeEvent({
    type: "turn_item.updated",
    driver: PACK_DRIVER,
    turnItem: {
      id: "item-1",
      threadId: "thread-1",
      runId: "run-1",
      nodeId: "node-1",
      providerThreadId: "provider-thread-1",
      providerTurnId: "provider-turn-1",
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 1,
      status: input.status ?? "completed",
      title: null,
      startedAt: NOW,
      completedAt: NOW,
      updatedAt: NOW,
      type: "dynamic_tool",
      toolName: "ies.workspace_status",
      input: { verbose: true },
      output: {
        packMcpToolCall: {
          server: "ies",
          tool: "workspace_status",
          ...(input.toolMeta === undefined ? {} : { toolMeta: input.toolMeta }),
          result: RESULT,
        },
        text: "3 projects, 1 stale",
      },
    },
  });

const recordingApps = () => {
  const reads: Array<{ providerThreadId: string; server: string; uri: string }> = [];
  const apps: PackMcpApps = {
    listTools: async () => [],
    callTool: async () => RESULT,
    readResource: async (request) => {
      reads.push(request);
      return {
        contents: [
          { uri: request.uri, mimeType: "text/html;profile=mcp-app", text: DASHBOARD_HTML },
        ],
      };
    },
  };
  return { apps, reads };
};

const outputOf = (event: ReturnType<typeof toolItemEvent>) =>
  event.type === "turn_item.updated" && event.turnItem.type === "dynamic_tool"
    ? event.turnItem.output
    : "not a tool item";

const withSnapshot = <A, E>(
  run: (input: {
    readonly snapshot: PackMcpAppSnapshot;
    readonly attachmentsDir: string;
  }) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "pack-mcp-app-" });
    const snapshot: PackMcpAppSnapshot = (input) =>
      snapshotMcpApp({ ...input, attachmentsDir }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      );
    return yield* run({ snapshot, attachmentsDir });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

it("offers MCP Apps in initialize and hides app-only tools from the model", () => {
  expect(PACK_MCP_APPS_HOST.clientCapabilities).toEqual({
    extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
  });
  expect(PACK_MCP_APPS_HOST.toolVisibleToModel(undefined)).toBe(true);
  expect(PACK_MCP_APPS_HOST.toolVisibleToModel({ ui: { visibility: ["model", "app"] } })).toBe(
    true,
  );
  expect(PACK_MCP_APPS_HOST.toolVisibleToModel({ ui: { visibility: ["app"] } })).toBe(false);
});

it.effect("an app tool's item carries the stored app reference beside its result", () =>
  withSnapshot(({ snapshot, attachmentsDir }) =>
    Effect.gen(function* () {
      const { apps, reads } = recordingApps();
      const capture = makePackMcpAppCapture({ mcpApps: apps, snapshot, driver });
      const event = yield* capture(
        toolItemEvent({ toolMeta: { ui: { resourceUri: "ui://ies/dashboard" } } }),
      );
      const output = outputOf(event);
      expect(reads).toEqual([
        { providerThreadId: "provider-thread-1", server: "ies", uri: "ui://ies/dashboard" },
      ]);
      expect(output).toEqual({
        t3McpApp: {
          attachmentId: expect.stringMatching(/-html$/),
          server: "ies",
          tool: "workspace_status",
          resourceUri: "ui://ies/dashboard",
        },
        result: RESULT,
      });
      const fileSystem = yield* FileSystem.FileSystem;
      const stored = yield* fileSystem.readDirectory(attachmentsDir, { recursive: true });
      expect(stored.some((name) => name.endsWith("-html.html"))).toBe(true);
    }),
  ),
);

it.effect("a tool without _meta.ui keeps its plain text and reads nothing", () =>
  withSnapshot(({ snapshot }) =>
    Effect.gen(function* () {
      const { apps, reads } = recordingApps();
      const capture = makePackMcpAppCapture({ mcpApps: apps, snapshot, driver });
      const event = yield* capture(toolItemEvent({}));
      expect(outputOf(event)).toBe("3 projects, 1 stale");
      expect(reads).toEqual([]);
    }),
  ),
);

it.effect("a running app tool stays plain until it completes", () =>
  withSnapshot(({ snapshot }) =>
    Effect.gen(function* () {
      const { apps, reads } = recordingApps();
      const capture = makePackMcpAppCapture({ mcpApps: apps, snapshot, driver });
      const event = yield* capture(
        toolItemEvent({
          status: "running",
          toolMeta: { ui: { resourceUri: "ui://ies/dashboard" } },
        }),
      );
      expect(outputOf(event)).toBe("3 projects, 1 stale");
      expect(reads).toEqual([]);
    }),
  ),
);
