import { useAccount } from "~/account/t3team-useAccounts";
import { useCloudBrokerStatus } from "~/cloud/t3team-useCloudBrokerStatus";

import { AccountSignInCard } from "../account/t3team-AccountSignInCard";

/**
 * The sign-in cloud sessions need, for the account the broker authenticates with. Renders nothing
 * without a broker, or once that account is signed in.
 */
export function CloudBrokerSignInBanner() {
  const broker = useCloudBrokerStatus();
  const { account, pending, error, signIn, openVerification } = useAccount(
    broker?.enabled ? broker.accountId : null,
  );
  return (
    <AccountSignInCard
      account={account}
      purpose="to use cloud sessions"
      pending={pending}
      error={error}
      onSignIn={signIn}
      onOpenVerification={openVerification}
    />
  );
}
