/**
 * The three thread-workflow HTTP actions a decision card or recipe card needs: answer a pending
 * `askUser`, submit a recipe card action, and pause/resume/stop a run. One definition serves both
 * the primary backend (`createT3Backend`) and a thread on another environment
 * (`t3team-environmentWorkflowBackend.ts`); only where the request goes and how it authenticates
 * differ, so the routes are not repeated.
 */
import type {
  LaunchProjectRecipeWorkflowRequest,
  LaunchProjectRecipeWorkflowResponse,
  SubmitProjectRecipeCardActionRequest,
  SubmitProjectRecipeCardActionResponse,
} from "@t3tools/project-recipes";

import type { BackendApi } from "./t3team-types";

export type ThreadWorkflowApi = Pick<
  BackendApi,
  "launchRecipeWorkflow" | "resolveWorkflowInput" | "submitRecipeCardAction"
> &
  Required<Pick<BackendApi, "controlWorkflow">>;

/** POST a JSON body to a t3team route of the server that owns the thread, and decode the reply. */
export type ThreadWorkflowPost = <TInput extends object, TResponse>(
  routePath: string,
  body: TInput,
) => Promise<TResponse>;

type ControlWorkflowInput = Parameters<NonNullable<BackendApi["controlWorkflow"]>>[0];
type ControlWorkflowResult = Awaited<ReturnType<NonNullable<BackendApi["controlWorkflow"]>>>;
type ResolveWorkflowInput = Parameters<BackendApi["resolveWorkflowInput"]>[0];

export function createThreadWorkflowApi(post: ThreadWorkflowPost): ThreadWorkflowApi {
  return {
    async launchRecipeWorkflow(input) {
      return post<LaunchProjectRecipeWorkflowRequest, LaunchProjectRecipeWorkflowResponse>(
        "/api/t3team/thread/recipe-workflow/launch",
        input,
      );
    },
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
