; build/installer.nsh —— 安装器自定义脚本。
; 由 electron-builder 的 nsis.include 注入（package.json build.nsis.include）。
; 安装器支持 English / 简体中文 双语：electron-builder 的 displayLanguageSelector 在安装
; 开始时弹出语言选择；preInit 强制默认语言为英文（1033），用户仍可在选择器里切到中文（2052）。
; 本页让用户选择是否创建桌面/开始菜单快捷方式（默认都勾选）。

!include LogicLib.nsh
!include NSDialogs.nsh

!ifndef BUILD_UNINSTALLER

  LangString AIDEA_SHORTCUT_TITLE    1033 "Choose the shortcuts to create:"
  LangString AIDEA_SHORTCUT_TITLE    2052 "选择要创建的快捷方式："
  LangString AIDEA_SHORTCUT_DESKTOP  1033 "Create desktop shortcut(&D)"
  LangString AIDEA_SHORTCUT_DESKTOP  2052 "创建桌面快捷方式(&D)"
  LangString AIDEA_SHORTCUT_STARTMENU 1033 "Create start menu shortcut(&S)"
  LangString AIDEA_SHORTCUT_STARTMENU 2052 "创建开始菜单快捷方式(&S)"

  ; 默认安装语言：英文（1033）。displayLanguageSelector 弹窗仍允许用户选择中文后覆盖。
  !macro preInit
    StrCpy $LANGUAGE "1033"
  !macroend

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

    ${NSD_CreateLabel} 0 8u 100% 12u "$(AIDEA_SHORTCUT_TITLE)"
    Pop $0

    ${NSD_CreateCheckBox} 0 36u 100% 12u "$(AIDEA_SHORTCUT_DESKTOP)"
    Pop $hDesktopCheckbox
    ${NSD_Check} $hDesktopCheckbox

    ${NSD_CreateCheckBox} 0 54u 100% 12u "$(AIDEA_SHORTCUT_STARTMENU)"
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