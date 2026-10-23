import * as SecureStore from "expo-secure-store";
import { createNexiOAuth } from "./t3team-nexiOAuth";
import { resolveNexiConfig } from "./t3team-nexiConfig";

const config = resolveNexiConfig();
const key = config ? `nexi.entra.${config.tenant}.${config.app}` : "nexi.entra.unconfigured";
const oauth = config
  ? createNexiOAuth(
      config,
      {
        read: () => SecureStore.getItemAsync(key),
        write: (value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        clear: () => SecureStore.deleteItemAsync(key),
      },
      {
        fetch: (...args) => fetch(...args),
        now: Date.now,
        sleep: (ms, signal) =>
          new Promise((resolve, reject) => {
            signal.throwIfAborted();
            const abort = () => {
              clearTimeout(timer);
              reject(signal.reason);
            };
            const timer = setTimeout(() => {
              signal.removeEventListener("abort", abort);
              resolve();
            }, ms);
            signal.addEventListener("abort", abort, { once: true });
          }),
      },
    )
  : null;

const listeners = new Set<() => void>();
export const subscribeNexiAccountChanges = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const notify = () => {
  for (const listener of listeners) listener();
};
export const nexiAccount = oauth
  ? {
      ...oauth,
      poll: async (...args: Parameters<typeof oauth.poll>) => {
        const token = await oauth.poll(...args);
        notify();
        return token;
      },
      signOut: async () => {
        await oauth.signOut();
        notify();
      },
    }
  : null;
