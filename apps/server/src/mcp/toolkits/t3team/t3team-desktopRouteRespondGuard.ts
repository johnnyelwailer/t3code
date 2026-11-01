/**
 * An agent never answers a desktop-route question: an answer records no author and the desktop
 * grants on it. Refused by id prefix (case-insensitive), so malformed, non-ASCII or mixed requests
 * are refused too; servers and desktops update independently.
 */
import { OrchestratorMcpFailure, isDesktopRouteQuestionIdPrefixed } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

export const refuseDesktopRouteAnswerFromAgent = (
  questions: ReadonlyArray<{ readonly id: string }>,
) =>
  questions.some((question) => isDesktopRouteQuestionIdPrefixed(question.id))
    ? Effect.fail(
        new OrchestratorMcpFailure({
          code: "capability_denied",
          message:
            "A desktop route is answered by the user on their own device, never by an agent. Wait for their answer.",
        }),
      )
    : Effect.void;
