import { useState, useSyncExternalStore } from "react";

import { SettingsActionRow } from "../settings/components/SettingsActionRow";
import { SettingsRow } from "../settings/components/SettingsRow";
import { SettingsSection } from "../settings/components/SettingsSection";
import {
  accountSignInMethods,
  accountStatusSnapshot,
  openVerification,
  signOutAccount,
  startAccountSignIn,
  subscribeAccountStatus,
} from "./t3team-accountController";
import { type AccountAction, presentAccountSection } from "./t3team-accountPresentation";

const ACTION_ICONS = {
  signIn: "person.badge.plus",
  signInWithCode: "keyboard",
  openVerification: "arrow.up.right",
  cancel: "xmark.circle.fill",
  signOut: "person.fill.xmark",
} as const satisfies Record<AccountAction, string>;

/**
 * The Microsoft (Entra ID) account in Settings: one-tap browser sign-in, the device code as an
 * explicit alternative (shown with its page link while it waits), and who is signed in. The sign-in authenticates Nexi cloud sessions.
 */
export function AccountSection() {
  const status = useSyncExternalStore(subscribeAccountStatus, accountStatusSnapshot);
  const view = presentAccountSection(status, accountSignInMethods());
  const [running, setRunning] = useState<AccountAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async (action: AccountAction) => {
    if (status === null) return;
    setRunning(action);
    setFailure(null);
    try {
      if (action === "signIn") setFailure((await startAccountSignIn())?.message ?? null);
      if (action === "signInWithCode") {
        setFailure((await startAccountSignIn("code"))?.message ?? null);
      }
      if (action === "openVerification") await openVerification(status);
      if (action === "cancel" || action === "signOut") await signOutAccount();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Something went wrong. Try again.");
    } finally {
      setRunning(null);
    }
  };
  const [primary] = view.actions;

  return (
    <SettingsSection title="Microsoft account" footer={failure ?? view.detail ?? undefined}>
      <SettingsRow
        icon="person.crop.circle"
        label={view.title}
        disabled={primary === undefined || running !== null}
        onPress={() => primary && void run(primary.action)}
      />
      {view.actions.map((entry) => (
        <SettingsActionRow
          key={entry.action}
          icon={ACTION_ICONS[entry.action]}
          label={entry.label}
          tone={entry.tone}
          loading={running === entry.action}
          disabled={running !== null}
          onPress={() => void run(entry.action)}
        />
      ))}
    </SettingsSection>
  );
}
