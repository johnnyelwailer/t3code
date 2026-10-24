import { requireOptionalNativeModule, NativeModule } from "expo";
import { nexiAccount } from "../features/connection/t3team-nexiAccount";

declare class BrokerNative extends NativeModule<{
  tokenRequested: (event: { requestId: string }) => void;
}> {
  start(session: string, streamUrl: string): Promise<number>;
  provideToken(requestId: string, token: string | null): void;
  closeAll(): void;
}
let native: BrokerNative | null = null;
export function nexiNative() {
  if (!native) {
    native = requireOptionalNativeModule<BrokerNative>("NexiBroker");
    if (!native) throw new Error("Nexi broker requires the Android release build.");
    const module = native;
    module.addListener("tokenRequested", ({ requestId }) => {
      void import("./t3team-nexiBroker")
        .then(async ({ mobileBroker }) => {
          await mobileBroker.checkEnabled();
          if (!nexiAccount) throw new Error("Nexplore is not configured.");
          return nexiAccount.accessToken();
        })
        .then(
          (token) => module.provideToken(requestId, token),
          () => module.provideToken(requestId, null),
        );
    });
  }
  return native;
}
export function closeNexiTunnels() {
  native?.closeAll();
}
