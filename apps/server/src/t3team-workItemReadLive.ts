/**
 * The live `t3team.work_item.*` read handlers: the policy service of `t3team-workItemReadService.ts`
 * over the host's mirror tables and the Atlassian provider. Services are resolved optionally when
 * the broker is built, so a runtime without the mirror gets no work-item tools (fail-closed: the
 * tools are absent, never half-working).
 */
import type { ThreadId } from "@t3tools/contracts";
import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import type { T3TeamWorkItemReadToolHandlers } from "./t3team-toolBrokerBindingWorkItemRead.ts";
import type { T3TeamThreadProject } from "./t3team-toolBrokerThreadReads.ts";
import {
  JIRA_NOT_CONNECTED_MESSAGE,
  makeUsableJiraBindingForThread,
} from "./t3team-workItemReadAvailability.ts";
import {
  getMirrorItem,
  isMirrorReady,
  listMirrorChildren,
  searchMirror,
} from "./t3team-workItemReadMirror.ts";
import { makeProjectScope } from "./t3team-workItemProjectScope.ts";
import { makeWorkItemReadService, type WorkItemReadPort } from "./t3team-workItemReadService.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

type ProviderServices = Effect.Services<ReturnType<typeof providerForAccount>>;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const makeWorkItemReadToolHandlers = Effect.fn("t3team.workItemRead.make")(
  function* (input: {
    readonly loadThreadProject: (threadId: ThreadId) => Effect.Effect<T3TeamThreadProject, string>;
  }) {
    const sql = Option.getOrUndefined(yield* Effect.serviceOption(SqlClient.SqlClient));
    if (sql === undefined) return undefined;
    const ambient = yield* Effect.context<never>();
    const provide = <A, E>(effect: Effect.Effect<A, E, ProviderServices | SqlClient.SqlClient>) =>
      effect.pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.provideContext(ambient as Context.Context<ProviderServices>),
        Effect.mapError(message),
      );
    const provider = (binding: JiraMirrorBinding) =>
      provide(providerForAccount(binding.accountId)).pipe(
        Effect.flatMap((candidate) =>
          candidate instanceof AtlassianIntegrationProvider
            ? Effect.succeed(candidate)
            : Effect.fail(JIRA_NOT_CONNECTED_MESSAGE),
        ),
      );

    const port: WorkItemReadPort = {
      mirrorReady: (binding) => provide(isMirrorReady(binding)),
      mirrorSearch: (binding, filters, limit, offset) =>
        provide(searchMirror(binding, filters, limit, offset)),
      mirrorGet: (binding, key) => provide(getMirrorItem(binding, key)),
      mirrorChildren: (binding, parentKey, limit) =>
        provide(listMirrorChildren(binding, parentKey, limit)),
      searchLive: (binding, jql, limit, cursor) =>
        provider(binding).pipe(
          Effect.flatMap((jira) =>
            Effect.tryPromise({
              try: () =>
                jira.searchIssuesByJql({
                  accountId: binding.accountId,
                  jql,
                  limit,
                  ...(cursor === undefined ? {} : { cursor }),
                }),
              catch: message,
            }),
          ),
          Effect.map((page) => ({
            items: page.items as ReadonlyArray<Record<string, unknown>>,
            nextCursor: page.nextCursor,
          })),
        ),
      comments: (binding, issueKey, limit) =>
        provider(binding).pipe(
          Effect.flatMap((jira) =>
            Effect.tryPromise({
              try: () =>
                jira.listIssueComments({
                  accountId: binding.accountId,
                  issueIdOrKey: issueKey,
                  limit,
                }),
              catch: message,
            }),
          ),
        ),
    };
    const service = makeWorkItemReadService(port);
    const projectScope = makeProjectScope(port);
    const usableBinding = makeUsableJiraBindingForThread(input);
    const withBinding =
      <A, Args>(run: (binding: JiraMirrorBinding, args: Args) => Effect.Effect<A, string>) =>
      (args: Args, threadId: ThreadId) =>
        usableBinding(threadId).pipe(
          Effect.flatMap((binding) =>
            binding === null ? Effect.fail(JIRA_NOT_CONNECTED_MESSAGE) : run(binding, args),
          ),
        );

    return {
      connected: (threadId) => Effect.map(usableBinding(threadId), (binding) => binding !== null),
      foreignKeys: (keys, threadId) => withBinding(projectScope.foreignKeys)(keys, threadId),
      search: withBinding(service.search),
      get: withBinding(service.get),
    } satisfies T3TeamWorkItemReadToolHandlers;
  },
);
