/**
 * A short memo of "who is this credential", keyed by credential identity so one user's login
 * is never handed to a request that carries another's. Bounded: a server that sees many
 * credentials forgets the oldest rather than growing.
 */

/** The fleet credential's identity does not change on the poll cadence. */
const LOGIN_MEMO_TTL_MS = 60_000;

const LOGIN_MEMO_CAPACITY = 64;

export const makeLoginMemo = () => {
  const entries = new Map<string, { readonly login: string; readonly expiresAt: number }>();
  return {
    get: (identity: string, nowMs: number): string | undefined => {
      const hit = entries.get(identity);
      return hit !== undefined && hit.expiresAt > nowMs ? hit.login : undefined;
    },
    set: (identity: string, login: string, nowMs: number): void => {
      entries.delete(identity);
      if (entries.size >= LOGIN_MEMO_CAPACITY) {
        const oldest = entries.keys().next();
        if (oldest.done !== true) entries.delete(oldest.value);
      }
      entries.set(identity, { login, expiresAt: nowMs + LOGIN_MEMO_TTL_MS });
    },
  } as const;
};
