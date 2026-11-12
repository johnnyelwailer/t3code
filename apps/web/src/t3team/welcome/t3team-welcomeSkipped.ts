import type { T3TeamWelcomeSkipKey } from "@t3tools/contracts";

export type WelcomeSkipKey = T3TeamWelcomeSkipKey;

export type WelcomeSkipState = Readonly<Record<WelcomeSkipKey, boolean>>;

export const INITIAL_WELCOME_SKIP: WelcomeSkipState = {
  account: false,
  jira: false,
  github: false,
  cloud: false,
};

export function withWelcomeSkip(state: WelcomeSkipState, key: WelcomeSkipKey): WelcomeSkipState {
  if (state[key]) return state;
  return { ...state, [key]: true };
}

/** The persisted list (client settings) as the page's skip state. */
export function welcomeSkipFromKeys(keys: readonly WelcomeSkipKey[] | undefined): WelcomeSkipState {
  return (keys ?? []).reduce(withWelcomeSkip, INITIAL_WELCOME_SKIP);
}

/** The persisted list after skipping `key`; the same array when it is already skipped. */
export function welcomeSkipKeysWith(
  keys: readonly WelcomeSkipKey[] | undefined,
  key: WelcomeSkipKey,
): readonly WelcomeSkipKey[] {
  const current = keys ?? [];
  return current.includes(key) ? current : [...current, key];
}
