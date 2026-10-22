import { KeyRoundIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import type {
  ConnectSignInNoticeTone,
  ConnectSignInNoticeView,
} from "../../cloud/t3team-connectSignInNotice.logic";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// Same surfaces as the provider update pill, so the sidebar footer stays one visual family.
const TONE_STYLES: Record<ConnectSignInNoticeTone, string> = {
  neutral: "bg-sidebar-control-surface text-sidebar-foreground hover:bg-sidebar-row-hover",
  loading: "bg-sidebar-control-surface text-sidebar-foreground",
  error: "bg-destructive/12 text-destructive hover:bg-destructive/18",
};

/** Presentational T3 Connect sign-in notice; the container decides what it says and does. */
export function ConnectSignInPillView({
  view,
  busy,
  canStart,
  onStart,
  onDismiss,
}: {
  readonly view: ConnectSignInNoticeView;
  readonly busy: boolean;
  readonly canStart: boolean;
  readonly onStart: () => void;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      className={`relative flex min-h-7 w-full shrink-0 items-center overflow-hidden rounded-lg text-2xs leading-4 font-medium transition-colors ${TONE_STYLES[view.tone]}`}
      data-testid="connect-sign-in-notice"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={view.description}
              disabled={!view.startsSignIn || !canStart || busy}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left disabled:cursor-default"
              onClick={onStart}
            >
              {view.tone === "loading" || busy ? (
                <Spinner size="sm" className="shrink-0" />
              ) : view.tone === "error" ? (
                <TriangleAlertIcon className="size-3.5 shrink-0" />
              ) : (
                <KeyRoundIcon className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 wrap-break-word">{view.title}</span>
            </button>
          }
        />
        <TooltipPopup side="top">{view.description}</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Dismiss T3 Connect sign-in notice"
              className="mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-70 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5 shrink-0" />
            </button>
          }
        />
        <TooltipPopup side="top">
          Hide until next start. Turn it off in Settings › Connections.
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}
