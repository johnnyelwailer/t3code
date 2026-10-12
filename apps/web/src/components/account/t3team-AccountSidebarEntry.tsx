import type { AccountStatus } from "@t3tools/contracts";
import { ChevronDownIcon, LogInIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import { useState } from "react";

import { useAccounts } from "~/account/t3team-useAccounts";

import { AccountSignInDialog } from "./t3team-AccountSignInDialog";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";

/**
 * The app's accounts in the Settings sidebar (`defineAccount` in a pack), one entry each. Signed
 * in, an entry opens a menu — signing out is an explicit item, never a click on the name (it ends
 * every feature that uses the account). Renders nothing when the build defines no account.
 */
export function AccountSidebarEntry() {
  const accounts = useAccounts();
  if (accounts.accounts === null || accounts.accounts.length === 0) return null;
  return (
    <SidebarMenu>
      {accounts.accounts.map((account) => (
        <SidebarMenuItem key={account.id}>
          <AccountEntry
            account={account}
            pending={accounts.pending}
            onSignIn={() => accounts.signIn(account.id)}
            onSignOut={() => accounts.signOut(account.id)}
            onOpenVerification={() => accounts.openVerification(account.id)}
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function AccountEntry({
  account,
  pending,
  onSignIn,
  onSignOut,
  onOpenVerification,
}: {
  readonly account: AccountStatus;
  readonly pending: boolean;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
  readonly onOpenVerification: () => void;
}) {
  const state = account.auth;
  const [reopenToken, setReopenToken] = useState(0);
  if (state._tag === "SignedIn") {
    return (
      <Menu>
        <MenuTrigger render={<SidebarMenuButton />}>
          <UserRoundIcon />
          <span className="truncate">
            {account.label}
            {state.name ? ` · ${state.name}` : ""}
          </span>
          <ChevronDownIcon className="ml-auto opacity-60" />
        </MenuTrigger>
        <MenuPopup align="start" side="top">
          <MenuGroup>
            <MenuGroupLabel>
              Signed in to {account.label}
              {state.name ? ` as ${state.name}` : ""}
            </MenuGroupLabel>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem disabled={pending} onClick={onSignOut}>
            <LogOutIcon />
            Sign out of {account.label}
          </MenuItem>
        </MenuPopup>
      </Menu>
    );
  }
  if (state._tag === "SigningIn") {
    return (
      <>
        <SidebarMenuButton onClick={() => setReopenToken((token) => token + 1)}>
          <LogInIcon />
          <span className="truncate">Signing in to {account.label}…</span>
        </SidebarMenuButton>
        <AccountSignInDialog
          account={account}
          reopenToken={reopenToken}
          onOpenVerification={onOpenVerification}
        />
      </>
    );
  }
  return (
    <SidebarMenuButton disabled={pending} onClick={onSignIn}>
      <LogInIcon />
      <span>Sign in to {account.label}</span>
    </SidebarMenuButton>
  );
}
