/**
 * An agent never answers a desktop-route question: the desktop grants whatever a resolved answer
 * says, and an answer records no author, so only the user's own client may give one. Refused for
 * every question whose id carries a proposal, whichever agent asks.
 *
 * @module t3team-desktopRouteRespondGuard
 */
import { OrchestratorMcpFailure, decodeDesktopRouteQuestionId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

export const refuseDesktopRouteAnswerFromAgent = (
  questions: ReadonlyArray<{ readonly id: string }>,
) =>
  questions.some((question) => decodeDesktopRouteQuestionId(question.id) !== null)
    ? Effect.fail(
        new OrchestratorMcpFailure({
          code: "capability_denied",
          message:
            "A desktop route is answered by the user on their own device, never by an agent. Wait for their answer.",
        }),
      )
    : Effect.void;
