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

export interface HostService {
  readonly request: (method: "GET" | "POST", path: string, body: unknown) => Promise<unknown>;
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
