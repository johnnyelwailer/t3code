import { useT3TeamAppBaseName } from "./t3team-appBrandName";

/** About → licenses row. The vendor name is the fallback when no pack is active. */
export function T3TeamAboutLicensesDescription() {
  const appName = useT3TeamAppBaseName();
  return <>Notices for dependencies, assets, and optional tools used by {appName}.</>;
}
