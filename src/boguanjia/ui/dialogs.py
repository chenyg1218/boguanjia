"""中文按钮的提示弹窗。"""

from __future__ import annotations

from boguanjia.qt import QMessageBox, Qt
from boguanjia.ui import styles as S


def _strip_help_button(widget) -> None:
    try:
        widget.setWindowFlag(Qt.WindowContextHelpButtonHint, False)
    except Exception:
        try:
            widget.setWindowFlags(widget.windowFlags() & ~Qt.WindowContextHelpButtonHint)
        except Exception:
            pass


def localize_msgbox(box: QMessageBox) -> QMessageBox:
    """将标准按钮改为中文，并套用与导入弹窗一致的主色按钮样式。"""
    _strip_help_button(box)
    mapping = {
        QMessageBox.Ok: "确定",
        QMessageBox.Cancel: "取消",
        QMessageBox.Yes: "是",
        QMessageBox.No: "否",
        QMessageBox.Close: "关闭",
        QMessageBox.Abort: "中止",
        QMessageBox.Retry: "重试",
        QMessageBox.Ignore: "忽略",
    }
    btn_qss = (
        f"QPushButton {{"
        f" background:{S.PRIMARY}; color:#FFFFFF; border:none;"
        f" padding:5px 10px; border-radius:{S.RADIUS}; font-size:12px;"
        f" min-width:72px; min-height:24px;"
        f"}}"
        f"QPushButton:hover {{ background:{S.PRIMARY_HOVER}; }}"
        f"QPushButton:pressed {{ background:#1E4BC7; }}"
    )
    for role, text in mapping.items():
        btn = box.button(role)
        if btn is not None:
            btn.setText(text)
            btn.setStyleSheet(btn_qss)
            btn.setCursor(Qt.PointingHandCursor)
    return box


def message_box(
    parent,
    title: str,
    text: str,
    *,
    icon=QMessageBox.Information,
) -> int:
    box = QMessageBox(parent)
    box.setIcon(icon)
    box.setWindowTitle(title)
    box.setText(text)
    box.setStandardButtons(QMessageBox.Ok)
    localize_msgbox(box)
    return box.exec_()


def info(parent, title: str, text: str) -> int:
    return message_box(parent, title, text, icon=QMessageBox.Information)


def warning(parent, title: str, text: str) -> int:
    return message_box(parent, title, text, icon=QMessageBox.Warning)


def question(parent, title: str, text: str) -> bool:
    box = QMessageBox(parent)
    box.setIcon(QMessageBox.Question)
    box.setWindowTitle(title)
    box.setText(text)
    box.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
    box.setDefaultButton(QMessageBox.No)
    localize_msgbox(box)
    return box.exec_() == QMessageBox.Yes
