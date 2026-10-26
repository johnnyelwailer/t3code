import { useState, useSyncExternalStore } from "react";

import { cloudSessionListWanted } from "./t3team-cloudSessionListDemand";
import {
  useDraftCloudQueuedSend,
  useHasPendingCloudQueuedSends,
} from "./t3team-cloudQueuedSendStore";
import { getCloudSessionLocal, subscribeCloudSessionLocal } from "./t3team-cloudSessionLocalStore";
import {
  cloudSessionTargetsNeedListRefresh,
  getCloudSessionTargets,
  subscribeCloudSessionTargets,
  useCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";

/**
 * What the cloud session controller needs to decide whether to load the list: the surface
 * visibility it owns (menu, panel), the shared facts that bind a composer to a session, and a
 * `lingering` latch the controller sets from the loaded list (see `cloudSessionListWanted`).
 */
export function useCloudSessionListDemand(scopeKey: string | null) {
  const localSession = useSyncExternalStore(
    subscribeCloudSessionLocal,
    getCloudSessionLocal,
    getCloudSessionLocal,
  );
  const targetsNeedRefresh = useSyncExternalStore(
    subscribeCloudSessionTargets,
    () => cloudSessionTargetsNeedListRefresh(getCloudSessionTargets()),
    () => false,
  );
  const queuedSendsPending = useHasPendingCloudQueuedSends();
  const target = useCloudSessionTarget(scopeKey);
  const queued = useDraftCloudQueuedSend(scopeKey);
  const [cloudMenuOpen, setCloudMenuOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [lingering, setLingering] = useState(false);
  const listWanted = cloudSessionListWanted({
    menuOpen: cloudMenuOpen,
    panelVisible,
    bound: target !== null || queued !== null,
    creating: targetsNeedRefresh,
    queuedSendPending: queuedSendsPending,
    localSession: localSession !== null,
    lingering,
  });
  return {
    listWanted,
    localSession,
    targetsNeedRefresh,
    queuedSendsPending,
    cloudMenuOpen,
    setCloudMenuOpen,
    panelVisible,
    setPanelVisible,
    lingering,
    setLingering,
  };
}
