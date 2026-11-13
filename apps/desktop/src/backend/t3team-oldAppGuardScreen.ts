/**
 * Inline quit-and-retry screen loaded in the app window (data URL). No modal, no extra close button:
 * native window controls stay the only close. The top padding clears traffic lights and titleBarOverlay.
 */
import {
  OLD_APP_GUARD_CONTINUING,
  OLD_APP_GUARD_ERROR,
  OLD_APP_GUARD_MESSAGE,
  OLD_APP_GUARD_RETRY,
  OLD_APP_GUARD_RETRYING,
  oldAppGuardButtonDisabled,
  oldAppGuardButtonLabel,
  oldAppGuardShowsError,
  type OldAppGuardState,
} from "./t3team-oldAppGuardCopy.ts";

export type OldAppGuardTheme = "light" | "dark";

export { OLD_APP_GUARD_MESSAGE, OLD_APP_GUARD_ERROR, OLD_APP_GUARD_RETRY };

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const css = (theme: OldAppGuardTheme): string => {
  const dark = theme === "dark";
  const bg = dark ? "#000000" : "#ffffff";
  const fg = dark ? "#f5f5f5" : "#111111";
  const btnBg = dark ? "#f5f5f5" : "#111111";
  const btnFg = dark ? "#111111" : "#f5f5f5";
  const btnDisabledBg = dark ? "#404040" : "#d4d4d4";
  const btnDisabledFg = dark ? "#a3a3a3" : "#737373";
  const err = dark ? "#fca5a5" : "#b91c1c";
  return (
    "html,body{margin:0;height:100%;background:" +
    bg +
    ";color:" +
    fg +
    ";font-family:system-ui,-apple-system,'Segoe UI',sans-serif;}" +
    "body{display:flex;flex-direction:column;min-height:100%;}" +
    ".chrome{flex:0 0 auto;height:max(40px,env(titlebar-area-height,52px));-webkit-app-region:drag;app-region:drag;}" +
    ".main{flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:24px 32px 48px;" +
    "-webkit-app-region:no-drag;app-region:no-drag;}" +
    ".panel{max-width:28rem;text-align:center;}" +
    ".message{margin:0 0 16px;font-size:15px;line-height:1.5;color:" +
    fg +
    ";}" +
    ".error{margin:0 0 16px;font-size:13px;line-height:1.4;color:" +
    err +
    ";}" +
    ".error[hidden]{display:none;}" +
    "button{appearance:none;border:0;border-radius:8px;padding:8px 18px;font:inherit;font-size:14px;" +
    "font-weight:550;background:" +
    btnBg +
    ";color:" +
    btnFg +
    ";cursor:pointer;}" +
    "button:disabled{background:" +
    btnDisabledBg +
    ";color:" +
    btnDisabledFg +
    ";cursor:default;}" +
    "button:focus-visible{outline:2px solid " +
    fg +
    ";outline-offset:3px;}" +
    ".status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}" +
    "html,body{color-scheme:" +
    theme +
    ";}"
  );
};

const script =
  "window.__nexiSetGuardState=function(state){" +
  "var btn=document.getElementById('retry');" +
  "var err=document.getElementById('error');" +
  "var status=document.getElementById('status');" +
  "var labels=" +
  JSON.stringify({
    blocked: OLD_APP_GUARD_RETRY,
    retrying: OLD_APP_GUARD_RETRYING,
    "still-running": OLD_APP_GUARD_RETRY,
    continuing: OLD_APP_GUARD_CONTINUING,
  }) +
  ";" +
  "var disabled=state==='retrying'||state==='continuing';" +
  "btn.textContent=labels[state]||labels.blocked;" +
  "btn.disabled=disabled;" +
  "err.hidden=state!=='still-running';" +
  "status.textContent=state==='retrying'?" +
  JSON.stringify(OLD_APP_GUARD_RETRYING) +
  ":state==='continuing'?" +
  JSON.stringify(OLD_APP_GUARD_CONTINUING) +
  ":state==='still-running'?" +
  JSON.stringify(OLD_APP_GUARD_ERROR) +
  ":'';" +
  "document.body.setAttribute('data-state',state);" +
  "};" +
  "document.getElementById('retry').addEventListener('click',function(){" +
  "if(this.disabled)return;" +
  "window.__nexiSetGuardState('retrying');" +
  "location.hash='retry-'+Date.now();" +
  "});";

export function buildOldAppGuardHtml(input: {
  readonly state: OldAppGuardState;
  readonly theme: OldAppGuardTheme;
}): string {
  const state = input.state;
  const errorHidden = oldAppGuardShowsError(state) ? "" : " hidden";
  const disabled = oldAppGuardButtonDisabled(state) ? " disabled" : "";
  const label = escapeHtml(oldAppGuardButtonLabel(state));
  return (
    '<!doctype html><html lang="en" class="' +
    input.theme +
    '"><head><meta charset="utf-8">' +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'\">" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>Nexi Work</title><style>" +
    css(input.theme) +
    '</style></head><body data-state="' +
    state +
    '"><div class="chrome" aria-hidden="true"></div>' +
    '<main class="main"><div class="panel">' +
    '<p class="message" id="message">' +
    escapeHtml(OLD_APP_GUARD_MESSAGE) +
    "</p>" +
    '<p class="error" id="error" role="alert"' +
    errorHidden +
    ">" +
    escapeHtml(OLD_APP_GUARD_ERROR) +
    "</p>" +
    '<button type="button" id="retry"' +
    disabled +
    ">" +
    label +
    "</button>" +
    '<div class="status" id="status" aria-live="polite"></div>' +
    "</div></main><script>" +
    script +
    "</script></body></html>"
  );
}

export function oldAppGuardDataUrl(input: {
  readonly state: OldAppGuardState;
  readonly theme: OldAppGuardTheme;
}): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildOldAppGuardHtml(input))}`;
}
