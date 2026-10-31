import type { T3TeamThreadViewContextPublication } from "@t3tools/contracts";

import { postJson } from "./t3team-t3BackendHttp";

/** The view's one client write: what it shows, for the thread opened beside it (`t3_view_read`). */
export function createViewContextApi(httpBaseUrl: string) {
  return {
    publishThreadViewContext(input: T3TeamThreadViewContextPublication): Promise<{ ok: true }> {
      return postJson(httpBaseUrl, "/api/t3team/thread/view-context", input);
    },
  };
}

export type ViewContextApi = ReturnType<typeof createViewContextApi>;

export function readViewContextApi(backend: unknown): ViewContextApi | undefined {
  const candidate = backend as Partial<ViewContextApi> | null;
  return typeof candidate?.publishThreadViewContext === "function"
    ? (candidate as ViewContextApi)
    : undefined;
}
