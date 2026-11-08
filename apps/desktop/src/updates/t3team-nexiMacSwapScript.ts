/**
 * The helper that swaps a staged Nexi Work.app into the place the running app lives, after the
 * running app has exited. Squirrel.Mac cannot do this for our builds (it needs a real signature and
 * ours are ad hoc), so the bundle is replaced directly. Everything it may delete is named on its
 * command line and checked against a pattern first: the old bundle's backup, the staging directory
 * and a failed new bundle. Nothing else is touched.
 *
 * Order, so that a failure at any step leaves a working app: wait for the old process to exit;
 * rename the old bundle to the backup; rename the staged bundle into place (both renames stay on the
 * app's own volume, the staging directory is its sibling); launch; require the new app to be running
 * and to still be running after a settle time; only then delete the backup. If the new app does not
 * come up, the failed bundle is deleted, the backup renamed back, and the old app launched again.
 */
export const NEXI_MAC_SWAP_SCRIPT = String.raw`#!/bin/bash
# usage: swap.sh <old pid> <staged app> <app path> <backup path> <staging dir> <log file> <launcher>
set -u
pid="$1" staged="$2" app="$3" backup="$4" stage="$5" log="$6" launcher="$7"
wait_exit="\${NEXI_SWAP_WAIT_EXIT:-60}" wait_launch="\${NEXI_SWAP_WAIT_LAUNCH:-20}" settle="\${NEXI_SWAP_SETTLE:-6}"

say() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$log" 2>/dev/null || true; }

# Refuse to delete or move anything that is not exactly what the app named.
case "$backup" in *.app.nexi-backup) ;; *) say "refusing: backup path '$backup' is not a *.app.nexi-backup"; exit 2 ;; esac
case "$stage" in */.*.update-*) ;; *) say "refusing: staging dir '$stage' is not a .*.update-* sibling"; exit 2 ;; esac
case "$staged" in "$stage"/*.app) ;; *) say "refusing: staged app '$staged' is not inside the staging dir"; exit 2 ;; esac
case "$app" in *.app) ;; *) say "refusing: '$app' is not an .app bundle"; exit 2 ;; esac
[ "$(dirname "$stage")" = "$(dirname "$app")" ] || { say "refusing: staging dir is not next to the app"; exit 2; }

# Pids of processes running out of the bundle $1. The path goes in the environment: on the command
# line, awk's own ps entry would match.
bundle_pids() {
  ps -axo pid=,command= | NEXI_BUNDLE_EXEC_DIR="$1/Contents/MacOS/" awk 'BEGIN { p = ENVIRON["NEXI_BUNDLE_EXEC_DIR"] } index($0, p) > 0 { print $1 }'
}
# Only a process that was not there before the launch counts: a leftover child of the old app was
# started from this same path and must not pass for the new app.
fresh_pids() { bundle_pids "$app" | grep -vxFf "$known" || true; }
new_running() { [ -n "$(fresh_pids)" ]; }
launch() { "$launcher" -n "$1" >>"$log" 2>&1; }
wait_for() { # up to $1 seconds, until the condition command (rest of args) succeeds
  local limit="$1" i=0; shift
  while [ "$i" -lt $((limit * 5)) ]; do "$@" && return 0; sleep 0.2; i=$((i + 1)); done
  return 1
}
old_gone() { ! kill -0 "$pid" 2>/dev/null; }

if ! wait_for "$wait_exit" old_gone; then
  say "the old app (pid $pid) did not exit within \${wait_exit}s; update abandoned, nothing changed"
  rm -rf -- "$stage"
  exit 1
fi

restore_and_relaunch() {
  say "restoring the previous version"
  # The failed bundle goes aside inside the staging dir first, so the backup is never put back over
  # (or the failed one deleted before) a bundle that is still in the way.
  if [ -e "$app" ]; then
    mv -- "$app" "$stage/failed.app" || { say "could not move the failed bundle aside; the previous version is at $backup"; return; }
  fi
  mv -- "$backup" "$app" && launch "$app"
  rm -rf -- "$stage"
}

[ ! -e "$backup" ] || { say "a backup from an earlier update is still at '$backup'; update abandoned, nothing changed"; launch "$app"; exit 1; }
known="$stage/.known-pids"
bundle_pids "$app" >"$known" 2>/dev/null || true
if ! mv -- "$app" "$backup"; then
  say "could not move the old app aside; update abandoned, nothing changed"
  rm -rf -- "$stage"
  launch "$app"
  exit 1
fi
if ! mv -- "$staged" "$app"; then
  say "could not move the new app into place"
  restore_and_relaunch
  exit 1
fi

launch "$app"
if wait_for "$wait_launch" new_running && sleep "$settle" && new_running; then
  say "the new app is running; removing the backup"
  rm -rf -- "$backup" "$stage"
  exit 0
fi
say "the new app did not stay running"
restore_and_relaunch
exit 1
`.replaceAll("\\${", "${");
