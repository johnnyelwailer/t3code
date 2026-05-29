import type { ThreadId } from "@t3tools/contracts";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export const T3WORK_MCP_SERVER_NAME = "t3work";
export const T3WORK_CURRENT_VIEW_RESOURCE_URI = "t3work://view/current";

export interface T3workBrokerServerTool {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: unknown;
}

export interface T3workBrokerServerResource {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string | null;
  readonly description?: string;
}

export interface T3workBrokerServerStatus {
  readonly authStatus: "unsupported";
  readonly name: string;
  readonly resourceTemplates: ReadonlyArray<never>;
  readonly resources: ReadonlyArray<T3workBrokerServerResource>;
  readonly tools: Readonly<Record<string, T3workBrokerServerTool>>;
}

export interface T3workToolCallResult {
  readonly content: ReadonlyArray<{
    readonly type: "text";
    readonly text: string;
  }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface T3workResourceReadResult {
  readonly contents: ReadonlyArray<{
    readonly mimeType?: string | null;
    readonly text: string;
    readonly uri: string;
  }>;
}

export type T3workTurnToolCapability = "read" | "write";

export interface T3workTurnToolDescriptor {
  readonly id: string;
  readonly label?: string;
  readonly capabilities: ReadonlyArray<T3workTurnToolCapability>;
}

export interface T3workTurnToolContext {
  readonly surface: string;
  readonly tools: ReadonlyArray<T3workTurnToolDescriptor>;
  readonly state: unknown;
}

export interface T3workBoundToolSurface {
  readonly listServers: () => ReadonlyArray<T3workBrokerServerStatus>;
  readonly callTool: (input: {
    readonly server: string;
    readonly tool: string;
    readonly arguments?: unknown;
    readonly threadId?: string | null;
  }) => Effect.Effect<T3workToolCallResult, never>;
  readonly readResource: (input: {
    readonly server: string;
    readonly threadId?: string | null;
    readonly uri: string;
  }) => Effect.Effect<T3workResourceReadResult, never>;
}

export interface T3workToolBinding extends T3workBoundToolSurface {
  readonly threadId: ThreadId;
}

export type T3workPrelaunchToolBindingCaller = "visibility" | "view.preRender";

export interface T3workPrelaunchToolBinding extends T3workBoundToolSurface {
  readonly bindingKey: string;
}

export interface T3workToolBrokerShape {
  readonly bindSession: (input: {
    readonly threadId: ThreadId;
    readonly toolContext?: T3workTurnToolContext;
    readonly allowedToolGroups?: ReadonlyArray<string>;
  }) => Effect.Effect<T3workToolBinding | undefined, never>;
  readonly bindReadOnly: (input: {
    readonly workspaceRoot: string;
    readonly callerKind: T3workPrelaunchToolBindingCaller;
    readonly renderContext: ProjectRecipeRenderContext;
    readonly allowedToolGroups?: ReadonlyArray<string>;
  }) => Effect.Effect<T3workPrelaunchToolBinding | undefined, never>;
}

export class T3workToolBroker extends Context.Service<T3workToolBroker, T3workToolBrokerShape>()(
  "t3/t3work-toolBroker/T3workToolBroker",
) {}

export const NoopT3workToolBroker: T3workToolBrokerShape = {
  bindSession: () => Effect.void.pipe(Effect.as(undefined)),
  bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
};
