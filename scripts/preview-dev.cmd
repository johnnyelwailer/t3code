@ECHO OFF
REM Wrapper so the preview tool can launch the t3code dev server with a stable
REM port (offset 1 -> web 5734 / server 13774) and the toolchain on PATH.
SET "PATH=C:\Program Files\nodejs;C:\Users\mdo\AppData\Roaming\npm;%PATH%"
SET "T3CODE_PORT_OFFSET=1"
SET "T3CODE_NO_BROWSER=1"
cd /d C:\git\t3code
"C:\Program Files\nodejs\corepack.cmd" pnpm dev
