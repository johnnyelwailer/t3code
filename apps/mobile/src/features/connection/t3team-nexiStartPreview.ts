import { useSyncExternalStore } from "react";
import { Linking } from "react-native";
import type { NexiStartFixtureName } from "./t3team-nexiStartFixtures";
import type { NexiStartInput } from "./t3team-nexiStartModel";

/**
 * Dev-client only. A `nexiPreview=<fixture name>` query on any app link (or the same value in
 * `EXPO_PUBLIC_NEXI_START_PREVIEW`) renders the real start screen from one of the table-test
 * fixtures, so every state can be seen on a device without an Entra account or a broker. Same
 * shape as the dev-only pairing deep link on Add environment. Release bundles have
 * `__DEV__ === false`: the listener is never attached and the fixtures never load.
 */
let current = __DEV__ ? (process.env.EXPO_PUBLIC_NEXI_START_PREVIEW ?? null) : null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function apply(url: string | null | undefined) {
  const name = url ? new URL(url).searchParams.get("nexiPreview") : null;
  if (name === null) return;
  current = name || null;
  for (const listener of listeners) listener();
}

if (__DEV__) {
  void Linking.getInitialURL().then(apply, () => {});
  Linking.addEventListener("url", (event) => apply(event.url));
}

export function useNexiStartPreview(): NexiStartInput | null {
  const name = useSyncExternalStore(subscribe, () => current);
  if (!__DEV__ || !name) return null;
  const { START_FIXTURES } =
    require("./t3team-nexiStartFixtures") as typeof import("./t3team-nexiStartFixtures");
  return START_FIXTURES[name as NexiStartFixtureName] ?? null;
}
