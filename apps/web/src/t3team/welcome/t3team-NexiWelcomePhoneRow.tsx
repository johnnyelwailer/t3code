import { SmartphoneIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { QRCodeSvg } from "~/components/ui/qr-code";

import { ServiceMark, WelcomeItem } from "./t3team-welcomeLayout";

/** Same host and repository the desktop updater reads; the phone opens it signed in to GHE. */
export const NEXI_ANDROID_DOWNLOAD_URL = "https://nexplore.ghe.com/hive/nx-nexi/releases?q=android";

export function NexiWelcomePhoneRow({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <WelcomeItem
      mark={
        <ServiceMark label="Phone">
          <SmartphoneIcon className="size-5" aria-hidden />
        </ServiceMark>
      }
      title="Phone"
      action={
        <Popover onOpenChange={(open) => (open ? onOpen() : undefined)}>
          <PopoverTrigger render={<Button size="sm" variant="outline" />}>Set up</PopoverTrigger>
          <PopoverPopup align="end">
            <div className="flex flex-col items-center gap-3">
              <PopoverTitle>Nexi Work for Android</PopoverTitle>
              <div className="rounded-lg bg-white p-1.5">
                <QRCodeSvg
                  value={NEXI_ANDROID_DOWNLOAD_URL}
                  size={160}
                  level="M"
                  marginSize={1}
                  title="Nexi Work for Android download link"
                />
              </div>
            </div>
          </PopoverPopup>
        </Popover>
      }
    />
  );
}
