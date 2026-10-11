// launchThread without the `launch` capability: refused at the call site.
import { launchThread } from "@t3team/sdk";

export const meta = {
  name: "fixtures.launch-thread-no-capability",
  description: "Calls launchThread without declaring launch.",
} as const;

export default async function run() {
  await launchThread({ key: "k", title: "t" });
  return "unreachable";
}
