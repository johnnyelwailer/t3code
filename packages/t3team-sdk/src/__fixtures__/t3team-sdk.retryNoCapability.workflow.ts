// Retry fixture with NO `schedule` capability: the runtime gate must refuse `retry` up front.
import { retry } from "@t3team/sdk";

export const meta = {
  name: "fixtures.retry-no-capability",
  description: "Calls retry without declaring the schedule capability.",
} as const;

export default async function run() {
  return await retry(async () => "never", { maxAttempts: 1, backoff: () => 0 });
}
