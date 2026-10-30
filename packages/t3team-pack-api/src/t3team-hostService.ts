export interface HostServiceContext {
  readonly stateDirectory: string;
  readonly localOrigin: string;
  readonly localAccessToken: () => Promise<string>;
  readonly accessToken: (
    account: string,
    resource: string,
    options?: { readonly forceRefresh?: boolean },
  ) => Promise<string>;
  readonly featureEnabled: (key: string) => boolean;
  readonly log: (event: string, fields: Readonly<Record<string, unknown>>) => void;
}

/** Who is asking, as the server authenticated them (never as the caller described themselves). */
export interface HostServiceCaller {
  /** True only for this computer's own desktop app session; a paired phone or any other client is false. */
  readonly desktop: boolean;
}

export interface HostService {
  /** `caller` is absent from a server that does not report it: a service that needs it refuses then. */
  readonly request: (
    method: "GET" | "POST",
    path: string,
    body: unknown,
    caller?: HostServiceCaller,
  ) => Promise<unknown>;
  readonly close: () => void | Promise<void>;
}

export interface HostServiceDefinition {
  readonly id: string;
  readonly start: (context: HostServiceContext) => Promise<HostService>;
  readonly command?: {
    readonly name: string;
    readonly run: (context: HostCommandContext, args: ReadonlyArray<string>) => Promise<void>;
  };
}

export interface HostCommandContext {
  readonly stateDirectory: string;
  readonly accessToken: (account: string, resource: string) => Promise<string>;
  readonly write: (message: string) => void;
  readonly featureEnabled: (key: string) => boolean;
}

export interface HostServiceRegistration {
  readonly defineHostService?: (definition: HostServiceDefinition) => void;
}
