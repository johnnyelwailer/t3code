import { CloudIcon, LogInIcon, LogOutIcon } from "lucide-react";

import { useCloudBrokerAuth } from "~/cloud/t3team-useCloudBrokerAuth";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";

/**
 * The Nexplore (Entra) sign-in in the Settings sidebar, beside T3 Connect: the account Nexi broker
 * cloud sessions run under. Renders nothing when no broker is configured.
 */
export function CloudBrokerSidebarEntry() {
  const auth = useCloudBrokerAuth();
  if (auth.status === null || !auth.status.enabled) return null;
  const state = auth.status.auth;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {state._tag === "SignedIn" ? (
          <SidebarMenuButton
            disabled={auth.pending}
            onClick={auth.signOut}
            title="Sign out of Nexplore"
          >
            <CloudIcon />
            <span className="truncate">Nexplore{state.name ? ` · ${state.name}` : ""}</span>
            <LogOutIcon className="ml-auto opacity-60" />
          </SidebarMenuButton>
        ) : state._tag === "SigningIn" ? (
          <SidebarMenuButton
            onClick={auth.openVerification}
            title="Copy the code and open Microsoft sign-in"
          >
            <LogInIcon />
            <span className="truncate">
              Enter <span className="font-mono font-semibold">{state.userCode}</span> at Microsoft
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
