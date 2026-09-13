/**
 * Client for `POST /api/t3team/thread/jobs` — out-of-band background-job
 * control (list / cancel / read a bounded page of retained output).
 *
 * The response carries the CAPABILITY: `{ supported: false }` is a 200, not
 * an error — the runtime keeps no controllable jobs (or the kill switch is
 * off), and the UI hides its cancel/output affordances on it. `unknown-job`
 * comes back inside `result` too; only transport and session failures throw.
 *
 * The controller is a plain function so the UI layer can be tested and
 * storybooked against a mock — no fetch in the component.
 *
 * @module t3team-thread-jobsBackend
 */
import type {
  ProviderJobControlRequest,
  ProviderJobControlResult,
} from "@t3tools/contracts";

import { postJson } from "./t3team-t3BackendHttp";

export type ThreadJobsControlResponse =
  | { readonly supported: false }
  | { readonly supported: true; readonly result: ProviderJobControlResult };

export type ThreadJobsController = (input: {
  readonly threadId: string;
  readonly request: ProviderJobControlRequest;
}) => Promise<ThreadJobsControlResponse>;

export function createThreadJobsController(httpBaseUrl: string): ThreadJobsController {
  return (input) =>
    postJson<
      { readonly threadId: string; readonly request: ProviderJobControlRequest },
      ThreadJobsControlResponse
    >(httpBaseUrl, "/api/t3team/thread/jobs", input);
}
