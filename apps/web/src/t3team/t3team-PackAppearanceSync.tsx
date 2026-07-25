import { useAtomValue } from "@effect/atom-react";
import {
  EnvironmentAppearance,
  type EnvironmentAppearance as Appearance,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";

import { syncBrowserChromeTheme } from "../hooks/useTheme";
import { primaryServerConfigAtom, primaryServerWelcomeAtom } from "../state/server";
import { applyT3TeamPackAppearance } from "./t3team-packAppearance";

export function T3TeamPackAppearanceSync() {
  const appearance = useAtomValue(primaryServerConfigAtom)?.environment.appearance;
  const welcomeAppearance = useAtomValue(primaryServerWelcomeAtom)?.environment.appearance;
  const [descriptorAppearance, setDescriptorAppearance] = useState<Appearance | undefined>(
    undefined,
  );
  const activeAppearance = welcomeAppearance ?? appearance ?? descriptorAppearance;
  useEffect(() => {
    let active = true;
    void fetch("/.well-known/t3/environment")
      .then((response) => response.json())
      .then((descriptor) => (descriptor as { appearance?: unknown }).appearance)
      .then(Schema.decodeUnknownSync(EnvironmentAppearance))
      .then((nextAppearance) => {
        if (active) setDescriptorAppearance(nextAppearance);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    applyT3TeamPackAppearance(activeAppearance);
    syncBrowserChromeTheme();
    return () => applyT3TeamPackAppearance(undefined);
  }, [activeAppearance]);
  return null;
}
