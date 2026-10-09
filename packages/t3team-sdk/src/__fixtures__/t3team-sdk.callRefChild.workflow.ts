// callRef child: echoes the policy answer it was asked to give.
import { getArgs } from "@t3team/sdk";

export const meta = { name: "fixtures.call-ref-child", description: "A merge policy." } as const;

export default async function run() {
  const args = getArgs() as { answer: unknown };
  return args.answer;
}
