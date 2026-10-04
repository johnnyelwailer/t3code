import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/**
 * Distribution builds replace the web client's T3 icons with the pack's brand icon.
 *
 * `applyWebBrandAssets` stamps T3's channel icons (favicon.ico, favicon-16/32, and the
 * apple-touch-icon.png that the boot splash in apps/web/index.html shows). The pack's
 * `branding.iconPng` / `branding.iconIco` (T3CODE_DESKTOP_ICON_PNG / _ICO, set by the
 * distribution installer) only reached the desktop app icon, so a Nexi Work build
 * booted behind a T3 logo and kept a T3 favicon. Browsers scale PNG icons, so the
 * pack PNG is copied as-is.
 *
 * Returns the number of files replaced (0 when the build has no distribution icon).
 */
export const applyDistributionWebIcons = Effect.fn("applyDistributionWebIcons")(function* (input: {
  readonly repoRoot: string;
  readonly targetDirectory: string;
  readonly iconPng: string | undefined;
  readonly iconIco: string | undefined;
}) {
  const iconPng = input.iconPng?.trim();
  if (!iconPng) return 0;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = path.join(input.repoRoot, input.targetDirectory);
  const copies: Array<readonly [string, string]> = [
    [iconPng, "apple-touch-icon.png"],
    [iconPng, "favicon-16x16.png"],
    [iconPng, "favicon-32x32.png"],
  ];
  const iconIco = input.iconIco?.trim();
  if (iconIco) copies.push([iconIco, "favicon.ico"]);
  yield* Effect.forEach(
    copies,
    ([source, fileName]) =>
      fs.copyFile(path.resolve(input.repoRoot, source), path.join(target, fileName)),
    { concurrency: "unbounded" },
  );
  return copies.length;
});
