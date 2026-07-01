import type { ResourcePage } from "@t3tools/project-context";

import type {
  AtlassianBacklogResponse,
  BackendApi,
  GitHubInboxDiscoverResponse,
} from "./t3work-types";
import { postJson } from "./t3work-t3BackendHttp";

type T3workPollEnvelope = {
  readonly enabled: true;
  readonly knownFingerprint?: string;
};

export type T3workPollResult<T> =
  | {
      readonly unchanged: true;
      readonly fingerprint: string;
    }
  | {
      readonly unchanged: false;
      readonly fingerprint: string;
      readonly value: T;
    };

export type T3workPollingBackend = BackendApi & {
  readonly atlassian: BackendApi["atlassian"] & {
    readonly pollBacklog: (input: {
      readonly account: {
        readonly id: string;
        readonly provider: string;
      };
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly boardId?: string;
      readonly sprintId?: string;
      readonly filterId?: string;
      readonly knownFingerprint?: string;
    }) => Promise<T3workPollResult<AtlassianBacklogResponse>>;
    readonly pollResources: (input: {
      readonly account: {
        readonly id: string;
        readonly provider: string;
      };
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly knownFingerprint?: string;
    }) => Promise<T3workPollResult<ResourcePage>>;
    readonly pollMyWork: (input: {
      readonly account: {
        readonly id: string;
        readonly provider: string;
      };
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly knownFingerprint?: string;
    }) => Promise<T3workPollResult<ResourcePage>>;
  };
  readonly github: BackendApi["github"] & {
    readonly pollInbox: (input: {
      readonly host: string;
      readonly projectKey?: string;
      readonly projectTitle?: string;
      readonly linkedRepositoryUrls?: ReadonlyArray<string>;
      readonly knownFingerprint?: string;
    }) => Promise<T3workPollResult<GitHubInboxDiscoverResponse>>;
  };
};

function withPollEnvelope<TInput extends object>(
  input: TInput,
  knownFingerprint: string | undefined,
): TInput & { readonly poll: T3workPollEnvelope } {
  return {
    ...input,
    poll: {
      enabled: true,
      ...(knownFingerprint !== undefined ? { knownFingerprint } : {}),
    },
  };
}

export function createAtlassianPollingBackendApi(httpBaseUrl: string) {
  return {
    pollBacklog(input: {
      readonly account: {
        readonly id: string;
        readonly provider: string;
      };
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly boardId?: string;
      readonly sprintId?: string;
      readonly filterId?: string;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly account: {
            readonly id: string;
            readonly provider: string;
          };
          readonly externalProjectId: string;
          readonly limit?: number;
          readonly boardId?: string;
          readonly sprintId?: string;
          readonly filterId?: string;
          readonly poll: T3workPollEnvelope;
        },
        T3workPollResult<AtlassianBacklogResponse>
      >(
        httpBaseUrl,
        "/api/t3work/atlassian/backlog/poll",
        withPollEnvelope(
          {
            account: input.account,
            externalProjectId: input.externalProjectId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
            ...(input.boardId ? { boardId: input.boardId } : {}),
            ...(input.sprintId ? { sprintId: input.sprintId } : {}),
            ...(input.filterId ? { filterId: input.filterId } : {}),
          },
          input.knownFingerprint,
        ),
      );
    },

    pollResources(input: {
      readonly account: {
        readonly id: string;
        readonly provider: string;
      };
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly account: {
            readonly id: string;
            readonly provider: string;
          };
          readonly externalProjectId: string;
          readonly limit?: number;
          readonly poll: T3workPollEnvelope;
        },
        T3workPollResult<ResourcePage>
      >(
        httpBaseUrl,
        "/api/t3work/atlassian/resources/poll",
        withPollEnvelope(
          {
            account: input.account,
            externalProjectId: input.externalProjectId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          },
          input.knownFingerprint,
        ),
      );
    },

    pollMyWork(input: {
      readonly account: {
        readonly id: string;
        readonly provider: string;
      };
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly account: {
            readonly id: string;
            readonly provider: string;
          };
          readonly externalProjectId: string;
          readonly limit?: number;
          readonly poll: T3workPollEnvelope;
        },
        T3workPollResult<ResourcePage>
      >(
        httpBaseUrl,
        "/api/t3work/atlassian/my-work/poll",
        withPollEnvelope(
          {
            account: input.account,
            externalProjectId: input.externalProjectId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          },
          input.knownFingerprint,
        ),
      );
    },
  };
}

export function createGitHubPollingBackendApi(httpBaseUrl: string) {
  return {
    pollInbox(input: {
      readonly host: string;
      readonly projectKey?: string;
      readonly projectTitle?: string;
      readonly linkedRepositoryUrls?: ReadonlyArray<string>;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly host: string;
          readonly projectKey?: string;
          readonly projectTitle?: string;
          readonly linkedRepositoryUrls?: ReadonlyArray<string>;
          readonly poll: T3workPollEnvelope;
        },
        T3workPollResult<GitHubInboxDiscoverResponse>
      >(
        httpBaseUrl,
        "/api/t3work/github/inbox/poll",
        withPollEnvelope(
          {
            host: input.host,
            ...(input.projectKey ? { projectKey: input.projectKey } : {}),
            ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
            ...(input.linkedRepositoryUrls
              ? { linkedRepositoryUrls: input.linkedRepositoryUrls }
              : {}),
          },
          input.knownFingerprint,
        ),
      );
    },
  };
}

export function asT3workPollingBackend(backend: BackendApi | null): T3workPollingBackend | null {
  return backend as T3workPollingBackend | null;
}
