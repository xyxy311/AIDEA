; build/installer.nsh —— 安装时让用户选择是否创建桌面/开始菜单快捷方式。
; 由 electron-builder 的 nsis.include 注入（package.json build.nsis.include）。
; 默认两者都创建（与之前行为一致）；用户可取消勾选以跳过对应快捷方式。

!include LogicLib.nsh
!include NSDialogs.nsh

!ifndef BUILD_UNINSTALLER

  Var hDesktopCheckbox
  Var hStartMenuCheckbox
  Var optDesktopShortcut
  Var optStartMenuShortcut

  Function shortcutOptionsPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 8u 100% 12u "选择要创建的快捷方式："
    Pop $0

    ${NSD_CreateCheckBox} 0 36u 100% 12u "创建桌面快捷方式(&D)"
    Pop $hDesktopCheckbox
    ${NSD_Check} $hDesktopCheckbox

    ${NSD_CreateCheckBox} 0 54u 100% 12u "创建开始菜单快捷方式(&S)"
    Pop $hStartMenuCheckbox
    ${NSD_Check} $hStartMenuCheckbox

    nsDialogs::Show
  FunctionEnd

  Function shortcutOptionsPageLeave
    ${NSD_GetState} $hDesktopCheckbox $optDesktopShortcut
    ${NSD_GetState} $hStartMenuCheckbox $optStartMenuShortcut
  FunctionEnd

  ; 在"选择安装位置"页与"安装"页之间插入快捷方式选择页
  !macro customPageAfterChangeDir
    Page custom shortcutOptionsPageCreate shortcutOptionsPageLeave
  !macroend

  ; 安装阶段（此时默认快捷方式已生成）按用户选择跳过不需要的快捷方式
  !macro customInstall
    StrCmp $optDesktopShortcut "0" 0 desktopKeep
      Delete "$newDesktopLink"
    desktopKeep:
    StrCmp $optStartMenuShortcut "0" 0 startMenuKeep
      Delete "$newStartMenuLink"
    startMenuKeep:
  !macroend

!endif