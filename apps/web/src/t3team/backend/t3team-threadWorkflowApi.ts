/**
 * The three thread-workflow HTTP actions a decision card or recipe card needs: answer a pending
 * `askUser`, submit a recipe card action, and pause/resume/stop a run. One definition serves both
 * the primary backend (`createT3Backend`) and a thread on another environment
 * (`t3team-environmentWorkflowBackend.ts`); only where the request goes and how it authenticates
 * differ, so the routes are not repeated.
 */
import type {
  SubmitProjectRecipeCardActionRequest,
  SubmitProjectRecipeCardActionResponse,
} from "@t3tools/project-recipes";

import type { BackendApi } from "./t3team-types";
import { postJson, type BackendAuthInit } from "./t3team-t3BackendHttp";

export type ThreadWorkflowApi = Pick<
  BackendApi,
  "resolveWorkflowInput" | "submitRecipeCardAction"
> &
  Required<Pick<BackendApi, "controlWorkflow">>;

/** Where a request goes right now. Resolved per call so a reconnect's new URL or token is used. */
export interface ThreadWorkflowTarget {
  readonly httpBaseUrl: string;
  readonly auth?: () => Promise<BackendAuthInit>;
}

type ControlWorkflowInput = Parameters<NonNullable<BackendApi["controlWorkflow"]>>[0];
type ControlWorkflowResult = Awaited<ReturnType<NonNullable<BackendApi["controlWorkflow"]>>>;
type ResolveWorkflowInput = Parameters<BackendApi["resolveWorkflowInput"]>[0];

export function createThreadWorkflowApi(
  resolveTarget: () => ThreadWorkflowTarget,
): ThreadWorkflowApi {
  const post = <TInput extends object, TResponse>(routePath: string, body: TInput) => {
    const { httpBaseUrl, auth } = resolveTarget();
    return postJson<TInput, TResponse>(httpBaseUrl, routePath, body, auth ? { auth } : undefined);
  };
  return {
    async submitRecipeCardAction(input) {
      return post<SubmitProjectRecipeCardActionRequest, SubmitProjectRecipeCardActionResponse>(
        "/api/t3team/thread/recipe-workflow/card-action",
        input,
      );
    },
    async resolveWorkflowInput(input) {
      await post<ResolveWorkflowInput, { ok: true }>(
        "/api/t3team/thread/workflow/resolve-input",
        input,
      );
    },
    async controlWorkflow(input) {
      return post<ControlWorkflowInput, ControlWorkflowResult>(
        "/api/t3team/thread/workflow/control",
        input,
      );
    },
  };
}
