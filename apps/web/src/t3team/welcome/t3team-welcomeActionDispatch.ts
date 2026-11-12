import type { WelcomeAgentAction } from "./t3team-welcomeAgents.logic";

export type WelcomeToolAuthHandlers = {
  readonly onInstall: (tool: "claude" | "codex") => void;
  readonly onSignIn: (tool: "claude" | "codex") => void;
};

/** Resolves which real handler a welcome agent action button should fire. */
export function dispatchWelcomeAgentAction(
  action: WelcomeAgentAction,
  handlers: WelcomeToolAuthHandlers,
): { readonly label: string; readonly run: () => void } | null {
  if (action.kind === "toolAuthInstall") {
    return { label: "Install", run: () => handlers.onInstall(action.tool) };
  }
  if (action.kind === "toolAuthSignIn") {
    return { label: "Sign in", run: () => handlers.onSignIn(action.tool) };
  }
  return null;
}

export type WelcomeAccountAction =
  | { readonly kind: "signIn" }
  | { readonly kind: "skip" }
  | { readonly kind: "copyAndOpen" }
  | { readonly kind: "retry" };

export function dispatchWelcomeAccountAction(
  action: WelcomeAccountAction,
  handlers: {
    readonly onSignIn: () => void;
    readonly onSkip: () => void;
    readonly onOpenVerification: () => void;
    readonly onRetry: () => void;
  },
): void {
  if (action.kind === "signIn") handlers.onSignIn();
  else if (action.kind === "skip") handlers.onSkip();
  else if (action.kind === "copyAndOpen") handlers.onOpenVerification();
  else handlers.onRetry();
}
