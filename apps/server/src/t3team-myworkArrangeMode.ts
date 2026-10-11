/**
 * `t3team.mywork.arrange` takes exactly one write. Channel only applies to storing a plan.
 */

export type MyWorkArrangeMode =
  | { readonly type: "plan"; readonly channel: "live" | "draft" }
  | { readonly type: "reset" }
  | { readonly type: "promote" }
  | { readonly type: "discardDraft" }
  | { readonly type: "recipe" };

const EXCLUSIVE =
  "takes exactly one of 'plan', 'reset: true', 'promote: true', 'discardDraft: true', or 'recipe'.";

export function myWorkArrangeMode(args: {
  readonly plan?: unknown;
  readonly reset?: boolean | undefined;
  readonly promote?: boolean | undefined;
  readonly discardDraft?: boolean | undefined;
  readonly recipe?: unknown;
  readonly channel?: string | undefined;
}):
  | { readonly ok: true; readonly mode: MyWorkArrangeMode }
  | { readonly ok: false; readonly message: string } {
  const selected = [
    args.plan !== undefined,
    args.reset === true,
    args.promote === true,
    args.discardDraft === true,
    args.recipe !== undefined,
  ].filter(Boolean).length;
  if (selected !== 1) return { ok: false, message: EXCLUSIVE };
  if (args.channel !== undefined && args.channel !== "live" && args.channel !== "draft") {
    return { ok: false, message: "channel must be 'live' or 'draft'." };
  }
  if (args.plan === undefined && args.channel !== undefined) {
    return { ok: false, message: "channel applies only when a plan is stored." };
  }
  if (args.plan !== undefined) {
    return {
      ok: true,
      mode: { type: "plan", channel: args.channel === "draft" ? "draft" : "live" },
    };
  }
  if (args.reset === true) return { ok: true, mode: { type: "reset" } };
  if (args.promote === true) return { ok: true, mode: { type: "promote" } };
  if (args.discardDraft === true) return { ok: true, mode: { type: "discardDraft" } };
  return { ok: true, mode: { type: "recipe" } };
}
