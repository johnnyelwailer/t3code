import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useT3TeamAppDisplayName } from "~/t3team/t3team-appBrandName";

import { undockViewTitle } from "./t3team-undockView";

/**
 * An undocked window's title names the view it shows now — it follows navigation inside the
 * window — so the window switcher and taskbar tell several apart from the main window.
 */
export function UndockedWindowTitleSync() {
  const appName = useT3TeamAppDisplayName();
  const viewTitle = useLocation({
    select: (location) =>
      undockViewTitle({ pathname: location.pathname, searchStr: location.searchStr }),
  });
  useEffect(() => {
    document.title = viewTitle === null ? appName : `${viewTitle} — ${appName}`;
  }, [appName, viewTitle]);
  return null;
}
