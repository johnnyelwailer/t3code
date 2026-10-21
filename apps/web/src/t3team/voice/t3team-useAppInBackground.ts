import { useEffect, useState } from "react";

const isInBackground = () => document.visibilityState === "hidden" || !document.hasFocus();

/** Whether the page is out of the user's sight: another window has focus, or the tab is hidden. */
export function useAppInBackground(): boolean {
  const [background, setBackground] = useState(isInBackground);
  useEffect(() => {
    const update = () => setBackground(isInBackground());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return background;
}
