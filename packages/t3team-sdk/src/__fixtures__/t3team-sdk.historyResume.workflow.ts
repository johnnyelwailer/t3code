import { Schema } from "effect";
import { checkpoint, getArgs, getResume } from "@t3team/sdk";

export const Inputs = Schema.Struct({ total: Schema.Number, crash: Schema.Boolean });
export const Outputs = Schema.Struct({ i: Schema.Number });
export const meta = {
  name: "fixtures.history-resume",
  description: "Exercises the checkpoint history ring across SDK crash-resume.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const { total, crash } = getArgs();
  const resume = getResume();
  let i = resume === undefined ? 0 : (resume.state as { i: number }).i;
  for (; i < total; i++) {
    await checkpoint({ state: { i: i + 1 }, retention: { history: 3 } });
    if (crash && resume === undefined && i + 1 === 2) throw new Error("simulated crash");
  }
  return { i };
}
