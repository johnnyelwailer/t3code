/**
 * The vocabulary of a `remoteEnvironment` session's view of another T3 server: what it can ask of
 * it (`RemoteEnvironmentApi`, implemented in `t3team-remoteEnvironmentApi.ts`), how that fails,
 * and what the session needs to open one (`RemoteEnvironmentSessionDeps`).
 */
import type {
  CloudSessionFailedError,
  MessageId,
  ModelSelection,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadLaunchInput,
  OrchestrationV2ThreadProjection,
  RunId,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import type * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import type * as Stream from "effect/Stream";

export class RemoteEnvironmentError extends Schema.TaggedError<RemoteEnvironmentError>()(
  "RemoteEnvironmentError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export interface RemoteEnvironmentProject {
  readonly id: OrchestrationV2ShellSnapshot["projects"][number]["id"];
  readonly title: string;
  readonly workspaceRoot: string;
  readonly repositoryIdentity?: OrchestrationV2ShellSnapshot["projects"][number]["repositoryIdentity"];
}

/** What a remote provider offers, as the session reads it (a `ServerProvider` satisfies it). */
export interface RemoteEnvironmentProvider {
  readonly instanceId: ServerProvider["instanceId"];
  readonly enabled: boolean;
  readonly models: ReadonlyArray<{ readonly slug: string }>;
}

/** The parts of the remote thread's projection a turn follows. */
export type RemoteThreadView = Pick<
  OrchestrationV2ThreadProjection,
  "runs" | "messages" | "runtimeRequests"
>;

export interface RemoteEnvironmentApi {
  readonly serverConfig: Effect.Effect<
    {
      readonly cwd: string;
      readonly projectFromCwd?: boolean;
      readonly providers: ReadonlyArray<RemoteEnvironmentProvider>;
    },
    RemoteEnvironmentError
  >;
  readonly projects: Effect.Effect<ReadonlyArray<RemoteEnvironmentProject>, RemoteEnvironmentError>;
  readonly launchThread: (
    input: Omit<OrchestrationV2ThreadLaunchInput, "commandId">,
  ) => Effect.Effect<void, RemoteEnvironmentError>;
  readonly dispatchMessage: (input: {
    readonly threadId: ThreadId;
    readonly messageId: MessageId;
    readonly text: string;
    readonly modelSelection: ModelSelection;
  }) => Effect.Effect<void, RemoteEnvironmentError>;
  readonly interruptRun: (input: {
    readonly threadId: ThreadId;
    readonly runId: RunId;
  }) => Effect.Effect<void, RemoteEnvironmentError>;
  readonly projection: (
    threadId: ThreadId,
  ) => Effect.Effect<RemoteThreadView, RemoteEnvironmentError>;
  /** Ticks on every change to the thread; fails when the connection drops. */
  readonly updates: (threadId: ThreadId) => Stream.Stream<void, RemoteEnvironmentError>;
}

export interface RemoteEnvironmentSessionDeps {
  /** Opens the cloud session's API in the caller's scope. */
  readonly open: (
    sessionId: string,
  ) => Effect.Effect<
    RemoteEnvironmentApi,
    RemoteEnvironmentError | CloudSessionFailedError,
    Scope.Scope
  >;
  /** Reconnects after a dropped connection before the turn fails. */
  readonly reconnectAttempts?: number;
  /** Connections tried while the session is still starting, before the turn fails. */
  readonly readinessAttempts?: number;
  readonly readinessInterval?: Duration.Input;
  /** How long an interrupt waits for the remote run to end before ending the turn itself. */
  readonly interruptGrace?: Duration.Input;
}
