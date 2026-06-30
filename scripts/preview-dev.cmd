@ECHO OFF
REM Wrapper so the preview tool can launch the t3code dev server on a stable port
REM (offset 1 -> web 5734 / server 13774) without opening a browser.
REM The repo root is derived from this script's own location (%~dp0 = scripts\),
REM so it works regardless of where the repo is cloned or which user runs it.
REM Requires Node.js + corepack on PATH (the normal Node install default).
SET "T3CODE_PORT_OFFSET=1"
SET "T3CODE_NO_BROWSER=1"
cd /d "%~dp0.." || EXIT /B 1
corepack pnpm dev
