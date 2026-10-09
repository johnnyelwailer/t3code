// callRef parent: calls config references the way a recipe calls its slots, failing closed.
import { Schema } from "effect";
import { callRef, getArgs } from "@t3team/sdk";

export const meta = { name: "fixtures.call-ref", description: "Calls config references." } as const;

const MergePolicy = Schema.Struct({
  mode: Schema.Literals(["manual", "auto"]),
  reason: Schema.String,
});

export default async function run() {
  const { ref, script } = getArgs() as { ref: unknown; script: unknown };
  const reasons: string[] = [];
  const call = (target: unknown, answer: unknown) =>
    callRef(
      target,
      { answer },
      {
        outputs: MergePolicy,
        fallback: () => ({ mode: "manual" as const, reason: "pack default" }),
        onFallback: (reason) => reasons.push(reason),
      },
    );
  const fits = await call(ref, { mode: "auto", reason: "label" });
  const misfit = await call(ref, { mode: "yolo" });
  const scripted = await call(script, { mode: "auto", reason: "x" });
  const none = await call(undefined, { mode: "auto", reason: "x" });
  return { fits, misfit, scripted, none, reasons };
}
