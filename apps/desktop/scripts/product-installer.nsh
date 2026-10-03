; Branded products retain the stock NSIS pages and the shared long-path directory installer.
!ifndef BUILD_UNINSTALLER
  !include "${__FILEDIR__}\installer-directories.nsh"
!endif

!macro customInstall
  !insertmacro dshFinishDirectories
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
!macroend
