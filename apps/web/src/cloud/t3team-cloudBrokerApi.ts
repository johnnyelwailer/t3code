import type {
  CloudBrokerStatus,
  CloudSessionAttachResult,
  CloudSessionPairingResult,
} from "@t3tools/contracts";

import { credentialRequest } from "~/account/t3team-credentialRequest";

/**
 * This machine's server, asked about the Nexi broker (`/api/t3team/cloud-broker/*`): whether it is
 * on and which account signs in to it, and attaching to a ready session. The sign-in itself is the
 * account's (`~/account/t3team-accountsApi`).
 */

/** Pairing writes to the VM's database, which can be slow while the session is busy. */
const PAIRING_TIMEOUT_MS = 75_000;
const fallbackReason = "broker_unavailable";

export const cloudBrokerApi = {
  status: () =>
    credentialRequest<CloudBrokerStatus>("GET", "/api/t3team/cloud-broker/status", {
      fallbackReason,
    }),
  attach: (sessionId: string, environmentId: string) =>
    credentialRequest<CloudSessionAttachResult>("POST", "/api/t3team/cloud-broker/attach", {
      body: { sessionId, environmentId },
      fallbackReason,
    }),
  pair: (sessionId: string) =>
    credentialRequest<CloudSessionPairingResult>("POST", "/api/t3team/cloud-broker/pairing", {
      body: { sessionId },
      timeoutMs: PAIRING_TIMEOUT_MS,
      fallbackReason,
    }),
};
