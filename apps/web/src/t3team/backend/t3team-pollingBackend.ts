import type { ResourcePage } from "@t3tools/project-context";

import type { AtlassianBacklogResponse, BackendApi } from "./t3team-types";
import { postJson } from "./t3team-t3BackendHttp";

type T3TeamPollEnvelope = { readonly enabled: true; readonly knownFingerprint?: string };
type PollAccountRef = { readonly id: string; readonly provider: string };

export type T3TeamPollResult<T> =
  | {
      readonly unchanged: true;
      readonly fingerprint: string;
    }
  | {
      readonly unchanged: false;
      readonly fingerprint: string;
      readonly value: T;
    };

export type T3TeamPollingBackend = BackendApi & {
  readonly atlassian: BackendApi["atlassian"] & {
    readonly pollBacklog: (input: {
      readonly account: PollAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly boardId?: string;
      readonly sprintId?: string;
      readonly filterId?: string;
      readonly quickFilterIds?: ReadonlyArray<string>;
      readonly knownFingerprint?: string;
    }) => Promise<T3TeamPollResult<AtlassianBacklogResponse>>;
    readonly pollResources: (input: {
      readonly account: PollAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly knownFingerprint?: string;
    }) => Promise<T3TeamPollResult<ResourcePage>>;
    readonly pollMyWork: (input: {
      readonly account: PollAccountRef;
      readonly externalProjectId: string;
      readonly knownFingerprint?: string;
    }) => Promise<T3TeamPollResult<ResourcePage>>;
  };
};

function withPollEnvelope<TInput extends object>(
  input: TInput,
  knownFingerprint: string | undefined,
): TInput & { readonly poll: T3TeamPollEnvelope } {
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
      readonly account: PollAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly boardId?: string;
      readonly sprintId?: string;
      readonly filterId?: string;
      readonly quickFilterIds?: ReadonlyArray<string>;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly account: PollAccountRef;
          readonly externalProjectId: string;
          readonly limit?: number;
          readonly boardId?: string;
          readonly sprintId?: string;
          readonly filterId?: string;
          readonly quickFilterIds?: ReadonlyArray<string>;
          readonly poll: T3TeamPollEnvelope;
        },
        T3TeamPollResult<AtlassianBacklogResponse>
      >(
        httpBaseUrl,
        "/api/t3team/atlassian/backlog/poll",
        withPollEnvelope(
          {
            account: input.account,
            externalProjectId: input.externalProjectId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
            ...(input.boardId ? { boardId: input.boardId } : {}),
            ...(input.sprintId ? { sprintId: input.sprintId } : {}),
            ...(input.filterId ? { filterId: input.filterId } : {}),
            ...(input.quickFilterIds?.length ? { quickFilterIds: input.quickFilterIds } : {}),
          },
          input.knownFingerprint,
        ),
      );
    },

    pollResources(input: {
      readonly account: PollAccountRef;
      readonly externalProjectId: string;
      readonly limit?: number;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly account: PollAccountRef;
          readonly externalProjectId: string;
          readonly limit?: number;
          readonly poll: T3TeamPollEnvelope;
        },
        T3TeamPollResult<ResourcePage>
      >(
        httpBaseUrl,
        "/api/t3team/atlassian/resources/poll",
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
      readonly account: PollAccountRef;
      readonly externalProjectId: string;
      readonly knownFingerprint?: string;
    }) {
      return postJson<
        {
          readonly account: PollAccountRef;
          readonly externalProjectId: string;
          readonly poll: T3TeamPollEnvelope;
        },
        T3TeamPollResult<ResourcePage>
      >(
        httpBaseUrl,
        "/api/t3team/atlassian/my-work/poll",
        withPollEnvelope(
          {
            account: input.account,
            externalProjectId: input.externalProjectId,
          },
          input.knownFingerprint,
        ),
      );
    },
  };
}

export function asT3TeamPollingBackend(backend: BackendApi | null): T3TeamPollingBackend | null {
  return backend as T3TeamPollingBackend | null;
}
