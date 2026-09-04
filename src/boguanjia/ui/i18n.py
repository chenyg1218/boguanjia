"""将 Qt 默认右键菜单 / 标准控件文案改为简体中文。

PySide2 自带的 qtbase 无 zh_CN，仅靠 qt_zh_CN.qm 无法覆盖输入框菜单，
故用自定义 QTranslator；WebEngine 标准动作再单独改文案。
"""

from __future__ import annotations

import os
from typing import List, Optional

from PySide2.QtCore import QLocale, QTranslator

from boguanjia.qt import QApplication, QWebEnginePage

# (context, sourceText) -> 简体中文
_WIDGET_ZH = {
    # QTextEdit / QPlainTextEdit 等
    ("QWidgetTextControl", "&Undo"): "撤销(&U)",
    ("QWidgetTextControl", "&Redo"): "重做(&R)",
    ("QWidgetTextControl", "Cu&t"): "剪切(&T)",
    ("QWidgetTextControl", "&Copy"): "复制(&C)",
    ("QWidgetTextControl", "&Paste"): "粘贴(&P)",
    ("QWidgetTextControl", "Delete"): "删除",
    ("QWidgetTextControl", "Select All"): "全选",
    # QLineEdit
    ("QLineEdit", "&Undo"): "撤销(&U)",
    ("QLineEdit", "&Redo"): "重做(&R)",
    ("QLineEdit", "Cu&t"): "剪切(&T)",
    ("QLineEdit", "&Copy"): "复制(&C)",
    ("QLineEdit", "&Paste"): "粘贴(&P)",
    ("QLineEdit", "Delete"): "删除",
    ("QLineEdit", "Select All"): "全选",
    # 文件对话框等
    ("QFileDialog", "Open"): "打开",
    ("QFileDialog", "&Open"): "打开(&O)",
    ("QFileDialog", "Save"): "保存",
    ("QFileDialog", "&Save"): "保存(&S)",
    ("QFileDialog", "Cancel"): "取消",
    ("QFileDialog", "&Cancel"): "取消(&C)",
    ("QFileDialog", "Close"): "关闭",
    ("QFileDialog", "&Close"): "关闭(&C)",
    ("QFileDialog", "Look in:"): "查找范围:",
    ("QFileDialog", "File &name:"): "文件名(&N):",
    ("QFileDialog", "File name:"): "文件名:",
    ("QFileDialog", "Files of type:"): "文件类型:",
    ("QFileDialog", "All Files (*)"): "所有文件 (*)",
    ("QDialogButtonBox", "OK"): "确定",
    ("QDialogButtonBox", "&OK"): "确定(&O)",
    ("QDialogButtonBox", "Cancel"): "取消",
    ("QDialogButtonBox", "&Cancel"): "取消(&C)",
    ("QDialogButtonBox", "Close"): "关闭",
    ("QDialogButtonBox", "&Close"): "关闭(&C)",
    ("QDialogButtonBox", "Yes"): "是",
    ("QDialogButtonBox", "&Yes"): "是(&Y)",
    ("QDialogButtonBox", "No"): "否",
    ("QDialogButtonBox", "&No"): "否(&N)",
    ("QDialogButtonBox", "Apply"): "应用",
    ("QDialogButtonBox", "&Apply"): "应用(&A)",
    ("QDialogButtonBox", "Reset"): "重置",
    ("QDialogButtonBox", "&Reset"): "重置(&R)",
    # WebEngine 标准动作（部分版本用 tr）
    ("QWebEnginePage", "Back"): "后退",
    ("QWebEnginePage", "&Back"): "后退(&B)",
    ("QWebEnginePage", "Forward"): "前进",
    ("QWebEnginePage", "&Forward"): "前进(&F)",
    ("QWebEnginePage", "Reload"): "重新加载",
    ("QWebEnginePage", "&Reload"): "重新加载(&R)",
    ("QWebEnginePage", "Stop"): "停止",
    ("QWebEnginePage", "&Stop"): "停止(&S)",
    ("QWebEnginePage", "Save Page"): "保存网页",
    ("QWebEnginePage", "Save page"): "保存网页",
    ("QWebEnginePage", "View Page Source"): "查看网页源代码",
    ("QWebEnginePage", "View page source"): "查看网页源代码",
    ("QWebEnginePage", "Cut"): "剪切",
    ("QWebEnginePage", "Cu&t"): "剪切(&T)",
    ("QWebEnginePage", "Copy"): "复制",
    ("QWebEnginePage", "&Copy"): "复制(&C)",
    ("QWebEnginePage", "Paste"): "粘贴",
    ("QWebEnginePage", "&Paste"): "粘贴(&P)",
    ("QWebEnginePage", "Undo"): "撤销",
    ("QWebEnginePage", "&Undo"): "撤销(&U)",
    ("QWebEnginePage", "Redo"): "重做",
    ("QWebEnginePage", "&Redo"): "重做(&R)",
    ("QWebEnginePage", "Select All"): "全选",
    ("QWebEnginePage", "Select all"): "全选",
    ("QWebEnginePage", "Select &All"): "全选(&A)",
    ("QWebEnginePage", "Paste and Match Style"): "粘贴并匹配样式",
    ("QWebEnginePage", "Open Link in This Window"): "在此窗口打开链接",
    ("QWebEnginePage", "Open Link in New Window"): "在新窗口打开链接",
    ("QWebEnginePage", "Open Link in New Tab"): "在新标签页打开链接",
    ("QWebEnginePage", "Copy Link URL"): "复制链接地址",
    ("QWebEnginePage", "Copy Link Address"): "复制链接地址",
    ("QWebEnginePage", "Copy link address"): "复制链接地址",
    ("QWebEnginePage", "Save Link"): "链接另存为…",
    ("QWebEnginePage", "Download Linked File"): "下载链接文件",
    ("QWebEnginePage", "Copy Image"): "复制图片",
    ("QWebEnginePage", "Copy Image URL"): "复制图片地址",
    ("QWebEnginePage", "Copy Image Address"): "复制图片地址",
    ("QWebEnginePage", "Save Image"): "图片另存为…",
    ("QWebEnginePage", "Copy Media URL"): "复制媒体地址",
    ("QWebEnginePage", "Toggle Media Controls"): "显示控件",
    ("QWebEnginePage", "Toggle Media Loop"): "循环播放",
    ("QWebEnginePage", "Toggle Media Play/Pause"): "播放/暂停",
    ("QWebEnginePage", "Toggle Media Mute"): "静音",
    ("QWebEnginePage", "Download Media"): "媒体另存为…",
    ("QWebEnginePage", "Inspect"): "检查",
    ("QWebEnginePage", "Inspect Element"): "检查元素",
    ("QWebEnginePage", "Exit Full Screen"): "退出全屏",
}

_WEB_ACTION_ZH = {
    "Back": "后退",
    "Forward": "前进",
    "Stop": "停止",
    "Reload": "重新加载",
    "ReloadAndBypassCache": "强制重新加载",
    "Cut": "剪切",
    "Copy": "复制",
    "Paste": "粘贴",
    "Undo": "撤销",
    "Redo": "重做",
    "SelectAll": "全选",
    "PasteAndMatchStyle": "粘贴并匹配样式",
    "OpenLinkInThisWindow": "在此窗口打开链接",
    "OpenLinkInNewWindow": "在新窗口打开链接",
    "OpenLinkInNewTab": "在新标签页打开链接",
    "CopyLinkToClipboard": "复制链接地址",
    "DownloadLinkToDisk": "链接另存为…",
    "CopyImageToClipboard": "复制图片",
    "CopyImageUrlToClipboard": "复制图片地址",
    "DownloadImageToDisk": "图片另存为…",
    "CopyMediaUrlToClipboard": "复制媒体地址",
    "ToggleMediaControls": "显示控件",
    "ToggleMediaLoop": "循环播放",
    "ToggleMediaPlayPause": "播放/暂停",
    "ToggleMediaMute": "静音",
    "DownloadMediaToDisk": "媒体另存为…",
    "InspectElement": "检查",
    "ExitFullScreen": "退出全屏",
    "RequestClose": "关闭",
    "Unselect": "取消选择",
    "SavePage": "保存网页",
    "ViewSource": "查看网页源代码",
}


class _ZhCnTranslator(QTranslator):
    def translate(self, context, source_text, disambiguation=None, n=-1):  # noqa: N802
        if not source_text:
            return ""
        hit = _WIDGET_ZH.get((context, source_text))
        return hit if hit is not None else ""


_installed: List[QTranslator] = []


def install_chinese_ui(app: QApplication) -> None:
    """安装简体中文翻译（应在创建 QApplication 后尽早调用）。"""
    QLocale.setDefault(QLocale(QLocale.Chinese, QLocale.China))

    # 官方 qm（有则装；无 zh_CN 的 qtbase 也不强求）
    try:
        import PySide2

        qm_dir = os.path.join(os.path.dirname(PySide2.__file__), "translations")
        for name in ("qt_zh_CN", "qtbase_zh_CN"):
            tr = QTranslator(app)
            if tr.load(name, qm_dir):
                app.installTranslator(tr)
                _installed.append(tr)
    except Exception:
        pass

    custom = _ZhCnTranslator(app)
    app.installTranslator(custom)
    _installed.append(custom)


def localize_webengine_page(page: Optional[QWebEnginePage]) -> None:
    """把 QWebEnginePage 标准右键动作改成中文。"""
    if page is None:
        return
    wa = getattr(QWebEnginePage, "WebAction", None)
    if wa is None:
        return
    for name, zh in _WEB_ACTION_ZH.items():
        enum_val = getattr(wa, name, None)
        if enum_val is None:
            continue
        try:
            action = page.action(enum_val)
        except Exception:
            continue
        if action is not None:
            action.setText(zh)
