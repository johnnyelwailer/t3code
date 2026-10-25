import { credentialRequest } from "~/account/t3team-credentialRequest";
import { connectPairing } from "~/connection/onboarding";
import { useAtomCommand } from "~/state/use-atom-command";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { appViewRegistry } from "./t3team-appViewRegistry";
import { ViewInstance } from "./t3team-ViewInstance";

const request = (service: string, path: string, body?: object): Promise<unknown> => {
  if (!/^[a-z][a-z0-9._-]*$/.test(service) || !/^[a-z][a-z0-9/_-]*$/.test(path)) {
    return Promise.reject(new Error("Invalid host service request"));
  }
  return credentialRequest(
    body === undefined ? "GET" : "POST",
    `/api/t3team/host-services/${service}/${path}`,
    {
      fallbackReason: "host_service_failed",
      ...(body === undefined ? {} : { body }),
      timeoutMs: 75_000,
    },
  );
};

export function ConnectionsSettingsSlot() {
  const pair = useAtomCommand(connectPairing, { reportFailure: false });
  const connect = async (pairingUrl: string) => {
    const result = await pair({ pairingUrl });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  };
  return appViewRegistry()
    .list("settings.connections")
    .map((entry) => (
      <ViewInstance
        key={entry.id}
        owner={entry.owner}
        resetKeys={[entry.id]}
        fallback={<p>This service could not be shown.</p>}
      >
        <entry.component request={request} connect={connect} />
      </ViewInstance>
    ));
}
