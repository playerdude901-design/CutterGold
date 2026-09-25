; Repair legacy/missing shortcuts on both installation and updater runs.
; electron-builder's "always" policy alone skips recreation during updates.
!macro customInstall
  ${ifNot} ${isNoDesktopShortcut}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
  ; Notify Explorer without deleting the user's global icon cache.
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
