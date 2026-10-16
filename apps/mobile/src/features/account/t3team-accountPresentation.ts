import type { AccountStatus } from "@t3tools/contracts";

import type { SignInMethods } from "./t3team-accountIssuer";

/**
 * What the Settings account section shows for each sign-in state: a status line and the actions
 * the state allows. `null` status means the stored grant is still being read. Signed out, the
 * browser sign-in is the one primary action; the sign-in code is a second, explicit row.
 */

export type AccountAction =
  | "signIn"
  | "signInWithCode"
  | "copyCode"
  | "copyLink"
  | "shareLink"
  | "cancel"
  | "signOut";

export interface AccountSectionPresentation {
  readonly title: string;
  readonly detail: string | null;
  readonly actions: ReadonlyArray<{
    readonly action: AccountAction;
    readonly label: string;
    readonly tone: "default" | "danger";
  }>;
}

const hostOf = (uri: string) => {
  try {
    return new URL(uri).host + new URL(uri).pathname.replace(/\/$/, "");
  } catch {
    return uri;
  }
};

const signedOutActions = (methods: SignInMethods): AccountSectionPresentation["actions"] => [
  { action: "signIn", label: "Sign in with Microsoft", tone: "default" },
  ...(methods.browser && methods.code
    ? [{ action: "signInWithCode", label: "Use a sign-in code instead", tone: "default" } as const]
    : []),
];

export function presentAccountSection(
  status: AccountStatus | null,
  methods: SignInMethods,
): AccountSectionPresentation {
  if (status === null) return { title: "Microsoft account", detail: "Checking…", actions: [] };
  const { auth } = status;
  switch (auth._tag) {
    case "SignedOut":
      return {
        title: "Not signed in",
        detail: status.lastError,
        actions: signedOutActions(methods),
      };
    case "SigningIn":
      return auth.userCode !== null && auth.verificationUri !== null
        ? {
            title: "Sign in on another device",
            detail:
              status.lastError ??
              `Open ${hostOf(auth.verificationUri)} on that device and enter the code. This phone waits.`,
            actions: [
              { action: "copyCode", label: "Copy code", tone: "default" },
              { action: "copyLink", label: "Copy page address", tone: "default" },
              { action: "shareLink", label: "Share page address and code", tone: "default" },
              { action: "cancel", label: "Cancel sign-in", tone: "danger" },
            ],
          }
        : {
            title: "Finish signing in in the browser",
            detail: status.lastError,
            actions: [{ action: "cancel", label: "Cancel sign-in", tone: "danger" }],
          };
    case "SignedIn":
      return {
        title: auth.name ?? "Signed in",
        detail: `${status.label} · Microsoft Entra ID`,
        actions: [{ action: "signOut", label: "Sign out", tone: "danger" }],
      };
  }
}
