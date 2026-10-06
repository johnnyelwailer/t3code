import type { CloudBrokerStatus } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { cloudBrokerApi } from "./t3team-cloudBrokerApi";

/**
 * Whether this machine's server reaches cloud sessions through the Nexi broker, and which account
 * signs in to it. Fixed for the server's lifetime, so it is read once and shared.
 */
let cached: Promise<CloudBrokerStatus | null> | null = null;

const read = () => {
  cached ??= cloudBrokerApi.status().catch(() => {
    cached = null; // a failed read is retried by the next surface that asks
    return null;
  });
  return cached;
};

/** Null until known (and after a failed read). */
export function useCloudBrokerStatus(): CloudBrokerStatus | null {
  const [status, setStatus] = useState<CloudBrokerStatus | null>(null);
  useEffect(() => {
    let live = true;
    void read().then((next) => live && setStatus(next));
    return () => {
      live = false;
    };
  }, []);
  return status;
}
