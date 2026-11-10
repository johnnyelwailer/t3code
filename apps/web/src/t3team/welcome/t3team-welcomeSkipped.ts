export type WelcomeSkipKey = "account" | "jira" | "github" | "cloud";

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
