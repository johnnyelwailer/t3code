import { createCloudSessionAtoms } from "@t3tools/client-runtime/state/cloud-sessions";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * The cloud session RPC commands an overlay (the Nexi pack's Android session rows) can run
 * against a connected desktop environment: stopping a machine and deleting its persistent
 * state. The phone's own cloud sessions stop through the broker instead; deleting
 * always needs a desktop's git and fleet-credential access.
 */
export const cloudSessionCommands = createCloudSessionAtoms(connectionAtomRuntime);
