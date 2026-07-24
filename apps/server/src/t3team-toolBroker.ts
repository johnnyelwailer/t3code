import type { ThreadId } from "@t3tools/contracts";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export const T3TEAM_MCP_SERVER_NAME = "t3team";
export const T3TEAM_CURRENT_VIEW_RESOURCE_URI = "t3team://view/current";

export interface T3TeamBrokerServerTool {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: unknown;
}

export interface T3TeamBrokerServerResource {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string | null;
  readonly description?: string;
}

export interface T3TeamBrokerServerStatus {
  readonly authStatus: "unsupported";
  readonly name: string;
  readonly resourceTemplates: ReadonlyArray<never>;
  readonly resources: ReadonlyArray<T3TeamBrokerServerResource>;
  readonly tools: Readonly<Record<string, T3TeamBrokerServerTool>>;
}

export interface T3TeamToolCallResult {
  readonly content: ReadonlyArray<{
    readonly type: "text";
    readonly text: string;
  }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface T3TeamResourceReadResult {
  readonly contents: ReadonlyArray<{
    readonly mimeType?: string | null;
    readonly text: string;
    readonly uri: string;
  }>;
}

export type T3TeamTurnToolCapability = "read" | "write";

export interface T3TeamTurnToolDescriptor {
  readonly id: string;
  readonly label?: string;
  readonly capabilities: ReadonlyArray<T3TeamTurnToolCapability>;
}

export interface T3TeamTurnToolContext {
  readonly surface: string;
  readonly tools: ReadonlyArray<T3TeamTurnToolDescriptor>;
  readonly state: unknown;
}

export interface T3TeamBoundToolSurface {
  readonly listServers: () => ReadonlyArray<T3TeamBrokerServerStatus>;
  readonly callTool: (input: {
    readonly server: string;
    readonly tool: string;
    readonly arguments?: unknown;
    readonly threadId?: string | null;
  }) => Effect.Effect<T3TeamToolCallResult, never>;
  readonly readResource: (input: {
    readonly server: string;
    readonly threadId?: string | null;
    readonly uri: string;
  }) => Effect.Effect<T3TeamResourceReadResult, never>;
}

export interface T3TeamToolBinding extends T3TeamBoundToolSurface {
  readonly threadId: ThreadId;
}

export type T3TeamPrelaunchToolBindingCaller = "visibility" | "view.preRender";

export interface T3TeamPrelaunchToolBinding extends T3TeamBoundToolSurface {
  readonly bindingKey: string;
}

export interface T3TeamToolBrokerShape {
  /**
   * Deliver a first-class inter-agent ("actor") message from one thread into
   * another. It is recorded as an `actor`-role message attributed to the sender
   * (never role `user`/`system`) and drives the receiving thread's agent to
   * react to it (auto-run a turn). The canonical use is a delegated child thread
   * reporting progress/results back to its parent, which then reacts. The hop
   * count is derived from the sender's active reaction turn input.
   */
  readonly sendMessage: (input: {
    readonly toThreadId: string;
    readonly fromThreadId: string;
    readonly text: string;
  }) => Effect.Effect<unknown, string>;
  readonly bindSession: (input: {
    readonly threadId: ThreadId;
    readonly toolContext?: T3TeamTurnToolContext;
    readonly allowedToolGroups?: ReadonlyArray<string>;
  }) => Effect.Effect<T3TeamToolBinding | undefined, never>;
  readonly bindReadOnly: (input: {
    readonly workspaceRoot: string;
    readonly callerKind: T3TeamPrelaunchToolBindingCaller;
    readonly renderContext: ProjectRecipeRenderContext;
    readonly allowedToolGroups?: ReadonlyArray<string>;
  }) => Effect.Effect<T3TeamPrelaunchToolBinding | undefined, never>;
}

export class T3TeamToolBroker extends Context.Service<T3TeamToolBroker, T3TeamToolBrokerShape>()(
  "t3/t3team-toolBroker/T3TeamToolBroker",
) {}

export const NoopT3TeamToolBroker: T3TeamToolBrokerShape = {
  sendMessage: () => Effect.fail("The t3team tool broker is not available in this runtime."),
  bindSession: () => Effect.void.pipe(Effect.as(undefined)),
  bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
};
