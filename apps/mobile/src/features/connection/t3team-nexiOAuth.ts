import {
  decodeToken,
  decodeCode,
  decodeStored,
  NexiSignInRequiredError,
  type NexiDeviceCode,
  type NexiTokens,
  type NexiOAuthConfig,
  type NexiTokenStorage,
} from "./t3team-nexiOAuthModel";
export {
  NexiSignInRequiredError,
  type NexiDeviceCode,
  type NexiTokenStorage,
} from "./t3team-nexiOAuthModel";
import { createNexiOAuthPost } from "./t3team-nexiOAuthRequest";

/** Mobile fetch/SecureStore adapter for the public-client grants in AccountOAuth. */
export function createNexiOAuth(
  config: NexiOAuthConfig,
  storage: NexiTokenStorage,
  deps: {
    fetch: typeof fetch;
    now: () => number;
    sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  },
) {
  let refresh: { readonly generation: number; readonly promise: Promise<string> } | undefined;
  // `generation` identifies the signed-in account: sign-out and a completed sign-in both start a new one,
  // so work begun for the previous account (a refresh, a pending write) can neither overwrite nor clear
  // the new one. `signOuts` lets a poll tell an explicit cancel from a sibling poll replacing the account.
  let generation = 0;
  let signOuts = 0;
  let persistence = Promise.resolve();
  const persist = <A>(action: () => Promise<A>) => {
    const next = persistence.then(action);
    persistence = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const scope = `api://${config.app}/relay.access openid profile offline_access`;
  const post = createNexiOAuthPost(config, deps.fetch);
  const save = async (body: unknown, previousRefresh: string | undefined, expected: number) => {
    const tokens = decodeToken(body);
    if (expected !== generation) throw new Error("Sign-in was cancelled.");
    const stored: NexiTokens = {
      ...tokens,
      refresh_token: tokens.refresh_token ?? previousRefresh,
      expiresAt: deps.now() + tokens.expires_in * 1000,
    };
    await persist(async () => {
      if (expected !== generation) throw new Error("Sign-in was cancelled.");
      await storage.write(JSON.stringify(stored));
    });
    if (expected !== generation) throw new Error("Sign-in was cancelled.");
    return stored.access_token;
  };
  const signOut = async () => {
    generation++;
    signOuts++;
    await persist(() => storage.clear());
  };
  return {
    signOut,
    requestCode: async (signal: AbortSignal) => {
      const response = await post(config.deviceEndpoint, { scope }, signal);
      if (!response.ok) throw new Error("Could not start Nexplore sign-in.");
      const code = decodeCode(await response.json());
      if (new URL(code.verification_uri).protocol !== "https:")
        throw new Error("Unsafe verification URL.");
      return code;
    },
    poll: async (code: NexiDeviceCode, signal: AbortSignal) => {
      const startedAfterSignOuts = signOuts;
      const deadline = deps.now() + code.expires_in * 1000;
      let interval = (code.interval ?? 5) * 1000;
      while (deps.now() < deadline) {
        await deps.sleep(Math.min(interval, deadline - deps.now()), signal);
        signal.throwIfAborted();
        if (deps.now() >= deadline) break;
        let response: Response;
        try {
          response = await post(
            config.tokenEndpoint,
            {
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: code.device_code,
            },
            signal,
          );
        } catch (error) {
          if (signal.aborted) throw error;
          continue;
        }
        if (response.status >= 500 || response.status === 429) continue;
        const body = await response.json();
        signal.throwIfAborted();
        if (response.ok) {
          decodeToken(body);
          if (startedAfterSignOuts !== signOuts) throw new Error("Sign-in was cancelled.");
          // The new account takes over before anything is saved: an in-flight refresh for the previous
          // account is abandoned and its outcome is ignored.
          generation++;
          refresh = undefined;
          return save(body, undefined, generation);
        }
        if (body.error === "authorization_pending") continue;
        if (body.error === "slow_down") {
          interval += 5000;
          continue;
        }
        throw new Error(
          body.error === "expired_token"
            ? "Sign-in code expired. Start again."
            : "Sign-in was declined.",
        );
      }
      throw new Error("Sign-in code expired. Start again.");
    },
    accessToken: async (): Promise<string> => {
      const readGeneration = generation;
      // Read behind queued writes and clears so a call made right after sign-out cannot see the old tokens.
      const raw = await persist(() => storage.read());
      if (readGeneration !== generation) throw new Error("Sign-in was cancelled.");
      if (!raw) throw new NexiSignInRequiredError("Sign in to Nexplore first.");
      let tokens: NexiTokens;
      try {
        tokens = decodeStored(JSON.parse(raw));
      } catch {
        await signOut();
        throw new NexiSignInRequiredError("Sign in to Nexplore again.");
      }
      if (tokens.expiresAt > deps.now() + 60_000) return tokens.access_token;
      if (!tokens.refresh_token) {
        await signOut();
        throw new NexiSignInRequiredError("Sign in to Nexplore again.");
      }
      // A refresh belongs to the generation that started it: after sign-out or an account switch a
      // new caller must not join it, and its outcome must not touch the newer session's state.
      let current = refresh;
      if (!current || current.generation !== generation) {
        const expected = generation;
        const promise: Promise<string> = (async () => {
          const response = await post(config.tokenEndpoint, {
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token!,
            scope,
          });
          if (!response.ok) {
            if (response.status === 400 || response.status === 401) {
              const body = await response.json();
              if (body.error === "invalid_grant" || body.error === "interaction_required") {
                if (expected !== generation) throw new Error("Sign-in was cancelled.");
                await signOut();
                throw new NexiSignInRequiredError(
                  "Could not refresh Nexplore sign-in. Sign in again.",
                );
              }
            }
            throw new Error("Could not refresh Nexplore sign-in. Try again or sign in again.");
          }
          return save(await response.json(), tokens.refresh_token, expected);
        })().finally(() => {
          if (refresh?.promise === promise) refresh = undefined;
        });
        current = refresh = { generation: expected, promise };
      }
      return current.promise;
    },
  };
}
