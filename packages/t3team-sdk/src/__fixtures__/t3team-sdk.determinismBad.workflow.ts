// Phase-25.5 static-audit fixture: trips every determinism rule at once.
// Head-level mutable state, a non-type runtime import, and unbound host globals.
import { Schema } from "effect";
import { helper } from "./not-a-type.ts";

let attempts = 0;

export const Inputs = Schema.Struct({});

export const meta = {
  name: "fixtures.determinism-bad",
  inputs: Inputs,
  description: "Fixture with every static determinism finding.",
} as const;

export default async function run() {
  const deadline = setTimeout(() => helper(attempts), 1000);
  const secret = process.env.TOKEN;
  const page = await fetch("https://example.test/data");

  return { deadline, secret, page };
}
