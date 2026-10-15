import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { View } from "react-native";

import { environmentCatalog } from "../../connection/catalog";
import { useAtomCommand } from "../../state/use-atom-command";
import { AccountSection } from "../account/t3team-AccountSection";
import { accountStatusSnapshot, subscribeAccountStatus } from "../account/t3team-accountController";
import { Hint } from "./t3team-BrokerDeviceSections";
import { becameSignedIn, brokerEnvironmentIds, needsBrokerSignIn } from "./t3team-brokerSignIn";

/**
 * Where a broker environment is blocked on `broker_sign_in_required`, the environment list offers
 * the Microsoft sign-in in place, and finishing it reconnects those environments at once instead
 * of waiting for a manual "Retry now".
 */
export function BrokerSignInPrompt() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const account = useSyncExternalStore(subscribeAccountStatus, accountStatusSnapshot);
  const retryNow = useAtomCommand(environmentCatalog.retryNow, { reportFailure: false });
  const brokerEnvironments = useMemo(() => brokerEnvironmentIds(catalog), [catalog]);
  const previous = useRef(account);

  useEffect(() => {
    if (becameSignedIn(previous.current, account)) {
      for (const environmentId of brokerEnvironments) void retryNow(environmentId);
    }
    previous.current = account;
  }, [account, brokerEnvironments, retryNow]);

  if (!needsBrokerSignIn(brokerEnvironments, account)) return null;
  return (
    <View className="mt-4 gap-2">
      <AccountSection />
      <Hint>Your Nexi machines and cloud sessions connect once you are signed in.</Hint>
    </View>
  );
}
