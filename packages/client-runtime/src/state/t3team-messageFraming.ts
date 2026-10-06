/**
 * Fork framing on V2 user messages, shared by every client timeline (web, mobile).
 *
 * Fork layers post some agent-facing framing as user-role messages the person never wrote:
 * - turns whose fork message ext says `visibleToUser: false` (e.g. the hidden transport of a
 *   widget action);
 * - anonymous server continuations dispatched with `createdBy: "system"` and no ext author (the
 *   transient-retry "Continue where you left off.", which the visible retry note already explains).
 *
 * A system-authored message that declares its author in the ext is NOT framing: workflow
 * `askAgent`/`notifyAgent`/repair prompts carry a workflow attribution so the person can see what
 * the agent was told ("observability over gates"). Upstream never authors a user message as
 * `system`, so this rule only ever touches fork traffic.
 */
import {
  readT3TeamMessageExtContext,
  type OrchestrationMessageContext,
  type OrchestrationV2Actor,
  type T3TeamMessageExt,
} from "@t3tools/contracts";

// Timelines re-derive on every projection update; context objects keep their identity across
// updates, so each one is decoded once.
const extByContext = new WeakMap<OrchestrationMessageContext, T3TeamMessageExt | null>();

/** The fork message ext a V2 user message carries in its context, decoded once per context. */
export function readT3TeamMessageExt(
  context: OrchestrationMessageContext | undefined,
): T3TeamMessageExt | undefined {
  if (context === undefined) return undefined;
  let ext = extByContext.get(context);
  if (ext === undefined) {
    ext = readT3TeamMessageExtContext(context) ?? null;
    extByContext.set(context, ext);
  }
  return ext ?? undefined;
}

export function isHiddenT3TeamFramingMessage(message: {
  readonly createdBy?: OrchestrationV2Actor | undefined;
  readonly context?: OrchestrationMessageContext | undefined;
}): boolean {
  const ext = readT3TeamMessageExt(message.context);
  if (ext?.visibleToUser === false) return true;
  return message.createdBy === "system" && ext?.author === undefined;
}
