export interface NoEnvironmentsHero {
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
}

/** The home empty state when no environment is connected: sign in first, then start a cloud session. */
export function noEnvironmentsHero(signedIn: boolean): NoEnvironmentsHero {
  return signedIn
    ? {
        title: "No environments connected",
        detail: "Start a cloud session to work from your phone.",
        actionLabel: "New cloud session",
      }
    : {
        title: "Sign in to continue",
        detail: "Sign in to connect your environments and start coding sessions from your phone.",
        actionLabel: "Sign in",
      };
}
