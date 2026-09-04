"""关于相关页：联系客服 / 帮助中心 / 版本信息。"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from boguanjia.builtin_config import load_json_resource
from boguanjia.paths import project_root
from boguanjia.qt import QHBoxLayout, QLabel, QPushButton, Qt, QVBoxLayout, QWidget
from boguanjia.ui import dialogs as D


def _load_support() -> dict:
    data = load_json_resource("support.json")
    # 开发态可用 config/support.json 覆盖
    if not getattr(sys, "frozen", False):
        cfg = project_root() / "config" / "support.json"
        if cfg.is_file():
            try:
                import json

                overlay = json.loads(cfg.read_text(encoding="utf-8"))
                if isinstance(overlay, dict):
                    data = {**data, **overlay}
            except Exception:
                pass
    return data if isinstance(data, dict) else {}


def _find_user_tutorial() -> Path:
    root = project_root()
    candidates = [
        root / "用户教程.md",
        root / "docs" / "用户教程.md",
    ]
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(Path(meipass) / "用户教程.md")
    for p in candidates:
        if p.is_file():
            return p
    return candidates[0]


def _open_path(path: Path) -> None:
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(str(path))
    if sys.platform == "win32":
        os.startfile(str(path))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


class _InfoPage(QWidget):
    def __init__(self, title: str, parent=None) -> None:
        super().__init__(parent)
        self.setObjectName("pageRoot")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        head = QWidget()
        head.setObjectName("pageHeader")
        head.setFixedHeight(52)
        hl = QHBoxLayout(head)
        hl.setContentsMargins(24, 0, 24, 0)
        t = QLabel(title)
        t.setObjectName("pageTitle")
        hl.addWidget(t)
        hl.addStretch(1)
        root.addWidget(head)

        self.content = QWidget()
        self.content.setObjectName("pageBody")
        self.body_layout = QVBoxLayout(self.content)
        self.body_layout.setContentsMargins(28, 24, 28, 28)
        self.body_layout.setSpacing(12)
        root.addWidget(self.content, stretch=1)


class ContactPage(_InfoPage):
    def __init__(self, parent=None) -> None:
        super().__init__("联系客服", parent)
        cfg = _load_support()
        lines = []
        if cfg.get("wechat"):
            lines.append(f"微信：{cfg['wechat']}")
        if cfg.get("qq"):
            lines.append(f"QQ：{cfg['qq']}")
        if cfg.get("phone"):
            lines.append(f"电话：{cfg['phone']}")
        link = str(cfg.get("link") or "").strip()
        link_label = str(cfg.get("link_label") or "官方链接").strip()
        if link:
            lines.append(f"{link_label}：{link}")
        extra = str(cfg.get("extra") or "").strip()
        if extra:
            lines.append(extra)
        if not lines:
            lines.append("暂未配置客服联系方式，请联系您的卡密销售方。")

        lbl = QLabel("\n".join(lines))
        lbl.setObjectName("pageSubtitle")
        lbl.setWordWrap(True)
        lbl.setTextInteractionFlags(Qt.TextSelectableByMouse | Qt.TextSelectableByKeyboard)
        self.body_layout.addWidget(lbl)
        self.body_layout.addStretch(1)


class HelpPage(_InfoPage):
    def __init__(self, parent=None) -> None:
        super().__init__("帮助中心", parent)
        faq = (
            "常见问题\n\n"
            "1. 「开始」是灰色的？\n"
            "   请先扫码登录，再点「提取直播信息」，确认直播间已开播。\n\n"
            "2. 如何同时跟多个账号？\n"
            "   激活专业版后，在「账号管理」新增账号并分别「打开」工作台。\n\n"
            "3. 卡密过期后？\n"
            "   自动任务会停止；可继续使用免费版（1 个账号），或续充恢复专业版。\n\n"
            "4. 详细步骤请参阅用户教程。"
        )
        lbl = QLabel(faq)
        lbl.setObjectName("pageSubtitle")
        lbl.setWordWrap(True)
        self.body_layout.addWidget(lbl)

        btn = QPushButton("打开用户教程")
        btn.setObjectName("pagePrimaryBtn")
        btn.setCursor(Qt.PointingHandCursor)
        btn.clicked.connect(self._open_tutorial)
        self.body_layout.addWidget(btn, alignment=Qt.AlignLeft)
        self.body_layout.addStretch(1)

    def _open_tutorial(self) -> None:
        path = _find_user_tutorial()
        try:
            _open_path(path)
        except Exception as exc:  # noqa: BLE001
            D.warning(self, "打开教程", f"无法打开教程文件：\n{path}\n{exc}")


class AboutPage(_InfoPage):
    def __init__(self, *, version: str = "1.0.0", parent=None) -> None:
        super().__init__("关于播管家", parent)
        ver = version.lstrip("Vv")
        lbl = QLabel(f"播管家  V{ver}\n直播跟播辅助工具\n当前平台：快手")
        lbl.setObjectName("pageSubtitle")
        lbl.setWordWrap(True)
        self.body_layout.addWidget(lbl)
        self.body_layout.addStretch(1)
