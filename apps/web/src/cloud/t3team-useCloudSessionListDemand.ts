import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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
/** How long a hover or focus on the Run-on trigger keeps the list asked for. */
export const CLOUD_MENU_HINT_MS = 30_000;

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
  const [triggerHinted, setTriggerHinted] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintCloudMenu = () => {
    setTriggerHinted(true);
    if (hintTimer.current !== null) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setTriggerHinted(false), CLOUD_MENU_HINT_MS);
  };
  useEffect(
    () => () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current);
    },
    [],
  );
  const listWanted = cloudSessionListWanted({
    menuOpen: cloudMenuOpen,
    triggerHinted,
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
    hintCloudMenu,
    panelVisible,
    setPanelVisible,
    lingering,
    setLingering,
  };
}
