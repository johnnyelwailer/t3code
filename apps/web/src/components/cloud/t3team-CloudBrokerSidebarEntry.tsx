import { ChevronDownIcon, CloudIcon, LogInIcon, LogOutIcon } from "lucide-react";

import { useCloudBrokerAuth } from "~/cloud/t3team-useCloudBrokerAuth";

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
 * The Nexplore (Entra) sign-in in the Settings sidebar, beside T3 Connect: the account Nexi broker
 * cloud sessions run under. Signed in, the entry opens a menu — signing out is an explicit item,
 * never a click on the name (it ends access to every cloud session). Renders nothing when no
 * broker is configured.
 */
export function CloudBrokerSidebarEntry() {
  const auth = useCloudBrokerAuth();
  if (auth.status === null || !auth.status.enabled) return null;
  const state = auth.status.auth;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {state._tag === "SignedIn" ? (
          <Menu>
            <MenuTrigger render={<SidebarMenuButton />}>
              <CloudIcon />
              <span className="truncate">Nexplore{state.name ? ` · ${state.name}` : ""}</span>
              <ChevronDownIcon className="ml-auto opacity-60" />
            </MenuTrigger>
            <MenuPopup align="start" side="top">
              <MenuGroup>
                <MenuGroupLabel>
                  Signed in to Nexplore{state.name ? ` as ${state.name}` : ""}
                </MenuGroupLabel>
              </MenuGroup>
              <MenuSeparator />
              <MenuItem disabled={auth.pending} onClick={auth.signOut}>
                <LogOutIcon />
                Sign out of Nexplore
              </MenuItem>
            </MenuPopup>
          </Menu>
        ) : state._tag === "SigningIn" ? (
          <SidebarMenuButton
            onClick={auth.openVerification}
            title="Copy the code and open Microsoft sign-in"
          >
            <LogInIcon />
            <span className="truncate">
              Signing in… or enter <span className="font-mono font-semibold">{state.userCode}</span>
            </span>
          </SidebarMenuButton>
        ) : (
          <SidebarMenuButton disabled={auth.pending} onClick={auth.signIn}>
            <LogInIcon />
            <span>Sign in to Nexplore</span>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
