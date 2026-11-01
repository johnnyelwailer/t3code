/**
 * The handler of `request_desktop_route`: checks the target is one plain token, then posts ONE
 * `t3_ask_user` question whose id carries the proposal and whose first line is derived from it alone,
 * so the desktop web client can grant on accept. Nothing is granted here.
 *
 * @module t3team-desktopRouteHandler
 */
import {
  DESKTOP_ROUTE_ALWAYS_LABEL,
  DESKTOP_ROUTE_DECLINE_LABEL,
  DESKTOP_ROUTE_ONCE_LABEL,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  decodeDesktopRouteQuestionId,
  isInternalDesktopRouteProposal,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
  escapeMarkdownText,
  stripInvisibleFormat,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { readCaller } from "../../threadAccess.ts";
import { t3TeamAskUser } from "./t3team-askUser.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";

const MAX_REASON_LENGTH = 500;
const NOTE =
  "Nothing is routed until the user accepts on their own computer; the answer arrives as the user's next message. Then run the failing command again. If their computer is offline or asleep nothing is granted and the command fails with a clear status (502, X-Nexi-Route): tell the user to wake their computer and ask again. An answer older than ten minutes is not applied.";

const refuse = (message: string) => new T3TeamMcpToolError({ message });
const oneLine = (text: string) => stripInvisibleFormat(text).replace(/\s+/g, " ").trim();

export const requestDesktopRoute = Effect.fn("T3TeamMcpToolkit.requestDesktopRoute")(
  function* (input: {
    readonly target: string;
    readonly reason: string;
    readonly internal?: boolean | undefined;
  }) {
    const { caller } = yield* readCaller();
    if (caller === undefined) {
      return yield* refuse("A desktop route can only be requested from a thread.");
    }
    const target = input.target.trim();
    const reason = oneLine(input.reason);
    const proposal = { target, internal: input.internal === true };
    // The same checks the client makes before it grants: one plain token, no wildcard, no credentials.
    const questionId = encodeDesktopRouteQuestionId(proposal);
    if (target.length === 0 || decodeDesktopRouteQuestionId(questionId) === null) {
      return yield* refuse(
        "The target must be one host name, URL, IP address or small range: no wildcards, no spaces, no credentials.",
      );
    }
    if (reason.length === 0) return yield* refuse("Say why in 'reason': the user reads it.");
    if (reason.length > MAX_REASON_LENGTH) {
      return yield* refuse(`'reason' must be at most ${MAX_REASON_LENGTH} characters.`);
    }
    const asked = yield* t3TeamAskUser(
      {
        header: DESKTOP_ROUTE_QUESTION_HEADER,
        // The first line is built from the proposal alone (the client requires it before it grants);
        // the agent's words are shown as plain text, never markdown.
        question: [
          desktopRouteQuestionLine(proposal),
          `The agent wrote the host and its reason. Why: ${escapeMarkdownText(reason)}`,
          "Only this host is routed, only while your computer is online, and everything routed is logged on this session's card.",
        ].join("\n\n"),
        options: [
          {
            label: DESKTOP_ROUTE_ONCE_LABEL,
            description: "Lets one connection through, then asks again.",
          },
          {
            label: DESKTOP_ROUTE_SESSION_LABEL,
            description: "Lets this cloud session reach this host until the session ends.",
          },
          // Never offered for an internal address: the agent's flag or the address itself decides.
          ...(isInternalDesktopRouteProposal(proposal)
            ? []
            : [
                {
                  label: DESKTOP_ROUTE_ALWAYS_LABEL,
                  description:
                    "Lets any of your cloud sessions reach this host. You can withdraw it later.",
                },
              ]),
          {
            label: DESKTOP_ROUTE_DECLINE_LABEL,
            description: "Routes nothing; the session keeps using its own network.",
          },
        ],
        allowFreeText: false,
      },
      caller.id,
      questionId,
    );
    return {
      asked: true as const,
      requestId: asked.requestId,
      questionId: asked.questionId,
      target,
      note: NOTE,
    };
  },
);
