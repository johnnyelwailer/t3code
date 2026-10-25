import type { NexiStartFixtureName } from "./t3team-nexiStartFixtures";
import type { NexiStartInput } from "./t3team-nexiStartModel";

/**
 * Dev-client only: `EXPO_PUBLIC_NEXI_START_PREVIEW=<fixture name>` renders the real start screen
 * from one of the table-test fixtures, so every state can be seen on a device without an Entra
 * account or a broker. Release bundles have `__DEV__ === false`, so the fixtures never load.
 */
export function nexiStartPreview(): NexiStartInput | null {
  if (!__DEV__) return null;
  const name = process.env.EXPO_PUBLIC_NEXI_START_PREVIEW as NexiStartFixtureName | undefined;
  if (!name) return null;
  const { START_FIXTURES } =
    require("./t3team-nexiStartFixtures") as typeof import("./t3team-nexiStartFixtures");
  return START_FIXTURES[name] ?? null;
}
