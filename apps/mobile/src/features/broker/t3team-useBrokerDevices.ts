import * as Effect from "effect/Effect";
import { useCallback, useEffect, useState } from "react";

import { runtime } from "../../lib/runtime";
import {
  accountStatusSnapshot,
  nexiBroker,
  subscribeAccountStatus,
} from "../account/t3team-accountController";
import { type BrokerDeviceListState, loadBrokerDeviceList } from "./t3team-brokerDeviceList";

const readDevices = () =>
  runtime.runPromise(Effect.promise(nexiBroker).pipe(Effect.flatMap(loadBrokerDeviceList)));

const isSignedIn = () => accountStatusSnapshot()?.auth._tag === "SignedIn";

/**
 * The broker's device list for the Machines screen. Reads again whenever the account signs in or
 * out, so finishing "Sign in with Microsoft" on that screen fills it without a manual refresh.
 */
export function useBrokerDevices() {
  const [state, setState] = useState<BrokerDeviceListState | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setState(await readDevices());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    let signedIn: boolean | null = null;
    const reloadOnSignInChange = () => {
      if (signedIn === isSignedIn()) return;
      signedIn = isSignedIn();
      void readDevices().then((next) => live && setState(next));
    };
    const unsubscribe = subscribeAccountStatus(reloadOnSignInChange);
    reloadOnSignInChange();
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return { state, refreshing, refresh };
}
