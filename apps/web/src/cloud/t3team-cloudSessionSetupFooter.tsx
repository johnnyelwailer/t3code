/**
 * The setup card as the messages-timeline footer: same constrained message column as chat rows,
 * so it never stretches full window width behind the thread detail panel.
 */
import type { ReactNode } from "react";

export function CloudSessionSetupFooter({ children }: { readonly children: ReactNode }) {
  return (
    <div className="messages-timeline-row-frame" data-cloud-setup-footer="">
      <div className="chat-content-lane overflow-x-clip">{children}</div>
    </div>
  );
}
