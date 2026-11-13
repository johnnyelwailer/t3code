; Isolated Nexi Work NSIS hooks. Upstream t3code builds keep installer.nsh and
; this file is not on their include path. Never pass /D (the install directory
; comes from the staged package name `nexi-work`, i.e. %LOCALAPPDATA%\Programs\nexi-work).
!include "StrFunc.nsh"
!include "WinMessages.nsh"
!ifdef BUILD_UNINSTALLER
  ${UnStrRep}
  !define T3StrRep '${UnStrRep}'
  ${UnStrContains}
  !define T3StrContains '${UnStrContains}'
!else
  ${StrRep}
  !define T3StrRep '${StrRep}'
  ${StrContains}
  !define T3StrContains '${StrContains}'
!endif

; The rc.16-era Nexi installer used upstream's appId, so its uninstall GUID is
; the same as T3 Code's. We may delete that *registry key* only when DisplayName
; and Publisher positively identify Nexi Work. Never delete T3 Code, never RMDir.
!define T3TEAM_STALE_NEXI_GUID "{e9197887-efb3-55e0-985e-d6d3b5dd594a}"
!define T3TEAM_STALE_NEXI_GUID_BARE "e9197887-efb3-55e0-985e-d6d3b5dd594a"

!macro customAppRunningMessages
  Push $0
  Push $1
  ${If} $IsPowerShellAvailable == 0
    System::Call 'kernel32::SetEnvironmentVariable(t "T3CODE_INSTALL_DIR", t "$INSTDIR")'
    nsExec::ExecToStack `"$PowerShellPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and [IO.Path]::GetDirectoryName($$_.ExecutablePath) -eq $$env:T3CODE_INSTALL_DIR } | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($$_.ExecutablePath) } | Where-Object { $$_ -in 'Nexi Work', 'T3 Code (Alpha)', 'T3 Code (Beta)', 'T3 Code (Nightly)' } | Select-Object -First 1 | ForEach-Object { [Console]::Write($$_) }"`
    Pop $0
    Pop $1
    System::Call 'kernel32::SetEnvironmentVariable(t "T3CODE_INSTALL_DIR", p 0)'
    ${If} $0 == 0
      ${If} $1 == "Nexi Work"
      ${OrIf} $1 == "T3 Code (Alpha)"
      ${OrIf} $1 == "T3 Code (Beta)"
      ${OrIf} $1 == "T3 Code (Nightly)"
        ${T3StrRep} $appRunningMessage $appRunningMessage "${PRODUCT_NAME}" $1
        ${T3StrRep} $appClosingMessage $appClosingMessage "${PRODUCT_NAME}" $1
        ${T3StrRep} $appCannotBeClosedMessage $appCannotBeClosedMessage "${PRODUCT_NAME}" $1
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro T3TeamIsStaleNexiKey root key result
  Push $R7
  Push $R8
  StrCpy ${result} 0
  ReadRegStr $R7 ${root} ${key} "DisplayName"
  ReadRegStr $R8 ${root} ${key} "Publisher"
  ${If} $R7 == "Nexi Work"
    ${If} $R8 == "Nexplore"
    ${OrIf} $R8 == "Nexi"
      StrCpy ${result} 1
    ${EndIf}
  ${EndIf}
  ${If} $R7 != ""
    ${T3StrContains} $R0 "T3 Code" $R7
    ${If} $R0 != ""
      StrCpy ${result} 0
    ${EndIf}
  ${EndIf}
  Pop $R8
  Pop $R7
!macroend

!macro T3TeamRemoveStaleNexiUninstallKey root key
  Push $R9
  !insertmacro T3TeamIsStaleNexiKey ${root} ${key} $R9
  ${If} $R9 == 1
    DetailPrint "Removing stale Nexi Work uninstall entry ${key} (files left in place)."
    DeleteRegKey ${root} ${key}
  ${EndIf}
  Pop $R9
!macroend

!macro T3TeamRemoveStaleNexiUninstallKeys
  !insertmacro T3TeamRemoveStaleNexiUninstallKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${T3TEAM_STALE_NEXI_GUID}"
  !insertmacro T3TeamRemoveStaleNexiUninstallKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${T3TEAM_STALE_NEXI_GUID_BARE}"
  !insertmacro T3TeamRemoveStaleNexiUninstallKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${T3TEAM_STALE_NEXI_GUID}"
  !insertmacro T3TeamRemoveStaleNexiUninstallKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${T3TEAM_STALE_NEXI_GUID_BARE}"
  !insertmacro T3TeamRemoveStaleNexiUninstallKey HKCU "Software\${T3TEAM_STALE_NEXI_GUID_BARE}"
!macroend

!macro T3TeamWriteNexiCliShim
  FileOpen $R0 "$INSTDIR\nexi.cmd" w
  FileWrite $R0 "@echo off$\r$\n"
  FileWrite $R0 "rem Written by Nexi Work: runs the desktop app's bundled nexi CLI.$\r$\n"
  FileWrite $R0 "setlocal EnableExtensions DisableDelayedExpansion$\r$\n"
  FileWrite $R0 "set $\"T3CODE_CLI_PATH=%~f0$\"$\r$\n"
  FileWrite $R0 "if not defined T3CODE_HOME set $\"T3CODE_HOME=%APPDATA%\\nexi-work$\"$\r$\n"
  FileWrite $R0 "set $\"T3CODE_DESKTOP_ISOLATED_INSTANCE=1$\"$\r$\n"
  FileWrite $R0 "set $\"T3CODE_DESKTOP_APP_ID=ch.nexplore.nexi.work$\"$\r$\n"
  FileWrite $R0 "set $\"ELECTRON_RUN_AS_NODE=1$\"$\r$\n"
  FileWrite $R0 "set $\"T3CODE_DESKTOP_CLI_LAUNCHER=1$\"$\r$\n"
  FileWrite $R0 "set $\"APP=%~dp0nexi-work.exe$\"$\r$\n"
  FileWrite $R0 "set $\"ENTRY=%~dp0resources\\app.asar\\apps\\server\\dist\\bin.mjs$\"$\r$\n"
  FileWrite $R0 "if exist $\"%~dp0resources\\app.asar\\apps\\server\\dist\\t3team-bin.mjs$\" set $\"ENTRY=%~dp0resources\\app.asar\\apps\\server\\dist\\t3team-bin.mjs$\"$\r$\n"
  FileWrite $R0 "if exist $\"%APP%$\" goto run$\r$\n"
  FileWrite $R0 "echo Nexi Work has moved or been removed. Open the app once to update this command. 1>&2$\r$\n"
  FileWrite $R0 "exit /b 127$\r$\n"
  FileWrite $R0 ":run$\r$\n"
  FileWrite $R0 "$\"%APP%$\" $\"%ENTRY%$\" %*$\r$\n"
  FileWrite $R0 "exit /b %ERRORLEVEL%$\r$\n"
  FileClose $R0
!macroend

!macro T3TeamAddUserPath dir
  Push $R1
  Push $R2
  Push $R3
  ReadRegStr $R1 HKCU "Environment" "Path"
  ${T3StrContains} $R2 "${dir}" $R1
  ${If} $R2 == ""
    ${If} $R1 == ""
      StrCpy $R3 "${dir}"
    ${Else}
      StrCpy $R3 "$R1;${dir}"
    ${EndIf}
    WriteRegExpandStr HKCU "Environment" "Path" $R3
    WriteRegStr HKCU "Software\Nexplore\Nexi Work" "CliPathDir" "${dir}"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    DetailPrint "Added ${dir} to the user PATH (nexi)."
  ${EndIf}
  Pop $R3
  Pop $R2
  Pop $R1
!macroend

!macro T3TeamRemoveUserPath dir
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  ReadRegStr $R4 HKCU "Software\Nexplore\Nexi Work" "CliPathDir"
  ${If} $R4 == ""
    StrCpy $R4 "${dir}"
  ${EndIf}
  ${If} $R4 != ""
    ReadRegStr $R1 HKCU "Environment" "Path"
    ${T3StrRep} $R2 $R1 ";$R4" ""
    ${T3StrRep} $R3 $R2 "$R4;" ""
    ${T3StrRep} $R2 $R3 "$R4" ""
    ${If} $R2 != $R1
      WriteRegExpandStr HKCU "Environment" "Path" $R2
      SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
      DetailPrint "Removed $R4 from the user PATH."
    ${EndIf}
    DeleteRegValue HKCU "Software\Nexplore\Nexi Work" "CliPathDir"
  ${EndIf}
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
!macroend

!macro customInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${IfNot} ${FileExists} "$newStartMenuLink"
      !insertmacro createMenuDirectory
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  !endif
  !insertmacro T3TeamRemoveStaleNexiUninstallKeys
  !insertmacro T3TeamWriteNexiCliShim
  !insertmacro T3TeamAddUserPath "$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro T3TeamRemoveUserPath "$INSTDIR"
  Delete "$INSTDIR\nexi.cmd"
!macroend
