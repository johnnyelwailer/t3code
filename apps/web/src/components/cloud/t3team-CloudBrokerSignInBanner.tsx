import { useCloudBrokerAuth } from "~/cloud/t3team-useCloudBrokerAuth";

import { CloudBrokerSignInCard } from "./t3team-CloudBrokerSignInCard";

/** The sign-in card, connected to this machine's server. Renders nothing when no broker is configured. */
export function CloudBrokerSignInBanner() {
  const auth = useCloudBrokerAuth();
  return (
    <CloudBrokerSignInCard
      status={auth.status}
      pending={auth.pending}
      error={auth.error}
      onSignIn={auth.signIn}
      onSignOut={auth.signOut}
      onOpenVerification={auth.openVerification}
    />
  );
}
