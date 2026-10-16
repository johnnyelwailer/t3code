import type { AccountStatus } from "@t3tools/contracts";

import type { SignInMethod, SignInMethods } from "./t3team-accountIssuer";

/**
 * What the Settings account section shows for each sign-in state: a status line and the actions
 * the state allows. `null` status means the stored grant is still being read. Signed out, the
 * browser sign-in is the one primary action; the sign-in code is a second, explicit row.
 */

export type AccountAction = "signIn" | "signInWithCode" | "openVerification" | "cancel" | "signOut";

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
            title: `Code ${auth.userCode}`,
            detail: status.lastError ?? `Enter it at ${hostOf(auth.verificationUri)}`,
            actions: [
              {
                action: "openVerification",
                label: "Copy code and open Microsoft",
                tone: "default",
              },
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

/**
 * After "Sign in" on a build with only a device code, the one tap continues straight to
 * Microsoft's page with the code on the clipboard. A code the user asked for explicitly
 * ("Use a sign-in code instead") waits for its own "Copy code and open Microsoft" tap.
 */
export const continuesToVerification = (
  status: AccountStatus,
  signIn: { readonly method: SignInMethod; readonly explicit: boolean },
): boolean =>
  signIn.method === "code" &&
  !signIn.explicit &&
  status.auth._tag === "SigningIn" &&
  status.auth.userCode !== null;
