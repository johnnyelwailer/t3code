/**
 * `POST /api/t3team/thread/jobs` — out-of-band background-job control.
 *
 * The user-facing companion to the thread's background-jobs indicator: list
 * the thread's live jobs, cancel one, or read a bounded page of its retained
 * output. The request is forwarded to the thread's provider session through
 * `ProviderService.jobControl`; the response is a capability-carrying result:
 *
 * - 200 `{ supported: false }` — the runtime exposes no job control (or a
 *   kill switch disabled it). A capability signal, not an error: the client
 *   hides its cancel/output affordances on this.
 * - 200 `{ supported: true, result }` — the runtime's own answer, including
 *   `unknown-job`, which is a RESULT, never an error response.
 * - 4xx/5xx — transport or session failures (malformed body, no live
 *   session, runtime request failed).
 *
 * Auth is handled upstream of the route like every other /api/t3team route.
 *
 * @module t3team-thread-jobs-route
 */
import type { ProviderJobControlInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import { ProviderJobControlUnsupportedError } from "./provider/Errors.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";

export function threadJobsValidationError(input: {
  readonly threadId?: unknown;
  readonly request?: unknown;
}): string | null {
  const threadId = input.threadId;
  const request = input.request;
  const kind: unknown =
    request !== null && typeof request === "object"
      ? (request as { kind?: unknown }).kind
      : undefined;
  if (typeof threadId !== "string" || threadId.trim().length === 0) {
    return "threadId and a request with kind list|cancel|read-output are required.";
  }
  if (kind !== "list" && kind !== "cancel" && kind !== "read-output") {
    return "threadId and a request with kind list|cancel|read-output are required.";
  }
  if (kind !== "list") {
    const jobId = (request as { jobId?: unknown } | undefined)?.jobId;
    if (typeof jobId !== "string" || jobId.length === 0) {
      return "cancel and read-output require a non-empty jobId.";
    }
  }
  return null;
}

export const t3teamThreadJobsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/jobs",
  Effect.gen(function* () {
    const input = yield* readJsonBody<ProviderJobControlInput>();
    // The body is untrusted JSON: validate the shape before handing it to
    // the service (the branded threadId keeps its type through the checks).
    const validationError = threadJobsValidationError(input);
    if (validationError !== null) {
      return yield* new T3TeamAtlassianError({ message: validationError });
    }

    const providerService = yield* ProviderService;
    // `unknown-job` is a RESULT, not an error: the registry simply does not
    // own that id (settled ago, other session, or fabricated), and the
    // round-trip itself succeeded.
    return yield* providerService.jobControl(input).pipe(
      Effect.map((result) => okJson({ supported: true, result })),
      // Capability signal, not a failure: the runtime keeps no controllable
      // jobs (or the kill switch is off). The client hides its affordances
      // on this, so the route answers 200 with the flag instead of 5xx.
      Effect.catchTag("ProviderJobControlUnsupportedError", () =>
        Effect.succeed(okJson({ supported: false })),
      ),
      // No live session: its job registry died with it, so nothing to list
      // or cancel. Routed through the shared T3TeamAtlassianError mapping
      // below (4xx) instead of a raw 5xx.
      Effect.catchTag("ProviderSessionNotFoundError", () =>
        Effect.fail(
          new T3TeamAtlassianError({
            message: "No active provider session for this thread; its jobs are gone with it.",
          }),
        ),
      ),
    );
  }).pipe(
    Effect.mapError((cause) => {
      return new T3TeamAtlassianError({
        message: cause instanceof T3TeamAtlassianError ? cause.message : "Failed to control jobs.",
        ...(cause instanceof T3TeamAtlassianError ? {} : { cause }),
      });
    }),
    Effect.catch(errorResponse),
  ),
);
