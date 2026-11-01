/**
 * An agent never answers a desktop-route question: an answer records no author and the desktop
 * grants on it. Refused by id prefix (case-insensitive), so malformed, non-ASCII or mixed requests
 * are refused too; servers and desktops update independently.
 */
import { OrchestratorMcpFailure, isDesktopRouteQuestionIdPrefixed } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

/** Every question of every `user_input_request` item for the request, not just the first item. */
export const refuseDesktopRouteAnswerFromAgent = (
  turnItems: ReadonlyArray<{ readonly type: string; readonly requestId?: string }>,
  requestId: string,
) =>
  turnItems.some(
    (item) =>
      item.type === "user_input_request" &&
      item.requestId === requestId &&
      "questions" in item &&
      Array.isArray(item.questions) &&
      item.questions.some((question: { readonly id: string }) =>
        isDesktopRouteQuestionIdPrefixed(question.id),
      ),
  )
    ? Effect.fail(
        new OrchestratorMcpFailure({
          code: "capability_denied",
          message:
            "A desktop route is answered by the user on their own device, never by an agent. Wait for their answer.",
        }),
      )
    : Effect.void;
