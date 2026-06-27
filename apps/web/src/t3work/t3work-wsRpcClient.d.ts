import type {
  AuthAccessStreamEvent,
  EnvironmentApi,
  LocalApi,
  ServerConfigStreamEvent,
  ServerLifecycleStreamEvent,
} from "@t3tools/contracts";

type StreamSubscriptionOptions = {
  readonly onResubscribe?: () => void;
};

type WsRpcClientServer = LocalApi["server"] & {
  readonly subscribeConfig: (
    listener: (event: ServerConfigStreamEvent) => void,
    options?: StreamSubscriptionOptions,
  ) => () => void;
  readonly subscribeLifecycle: (
    listener: (event: ServerLifecycleStreamEvent) => void,
    options?: StreamSubscriptionOptions,
  ) => () => void;
  readonly subscribeAuthAccess: (
    listener: (event: AuthAccessStreamEvent) => void,
    options?: StreamSubscriptionOptions,
  ) => () => void;
};

declare module "../rpc/wsRpcClient" {
  interface WsRpcClient {
    readonly terminal: EnvironmentApi["terminal"];
    readonly server: WsRpcClientServer;
    readonly orchestration: EnvironmentApi["orchestration"];
  }
}
