// Budget fixture: reads budget.total / spent() / remaining(). Token rollup across thread
// turns is deferred (Epic 25 §Out of scope), so spent() is 0 and remaining() equals total;
// the reads replay identically on resume.
import { Schema } from "effect";
import { getBudget } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  total: Schema.Number,
  spent: Schema.Number,
  remaining: Schema.Number,
});

export const meta = {
  name: "fixtures.budget-primitive",
  description: "Reads budget.total / spent() / remaining().",
  inputs: Inputs,
  outputs: Outputs,
} as const;

export default async function run() {
  const budget = getBudget();

  return { total: budget.total, spent: budget.spent(), remaining: budget.remaining() };
}
