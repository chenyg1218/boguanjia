"""左侧导航栏。"""

from __future__ import annotations

from boguanjia.qt import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    Qt,
    QVBoxLayout,
    QWidget,
    Signal,
)
from boguanjia.ui import styles as S

# 导航键 → 显示文案
NAV_WORKBENCH = "workbench"
NAV_ACCOUNTS = "accounts"
NAV_PRICING = "pricing"
NAV_CONTACT = "contact"
NAV_HELP = "help"
NAV_ABOUT = "about"

_PRIMARY_ITEMS = (
    (NAV_WORKBENCH, "工作台"),
    (NAV_ACCOUNTS, "账号管理"),
)

_ABOUT_ITEMS = (
    (NAV_CONTACT, "联系客服"),
    (NAV_HELP, "帮助中心"),
)


class SideNav(QWidget):
    """深色侧栏：主功能 + 底部升级入口 + 关于组。"""

    navigated = Signal(str)  # nav key

    def __init__(self, *, version: str = "1.1.0", parent=None) -> None:
        super().__init__(parent)
        self.setObjectName("sideNav")
        self.setFixedWidth(208)
        self._buttons: dict = {}
        self._current = NAV_WORKBENCH
        self._build(version)
        self.set_active(NAV_WORKBENCH)

    def _build(self, version: str) -> None:
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        brand_wrap = QWidget()
        brand_wrap.setObjectName("sideBrand")
        brand_wrap.setFixedHeight(60)
        bl = QHBoxLayout(brand_wrap)
        bl.setContentsMargins(20, 0, 20, 0)
        brand = QLabel("播管家")
        brand.setObjectName("sideBrandTitle")
        bl.addWidget(brand)
        root.addWidget(brand_wrap)

        nav_block = QWidget()
        nav_lay = QVBoxLayout(nav_block)
        nav_lay.setContentsMargins(12, 12, 12, 8)
        nav_lay.setSpacing(6)
        for key, text in _PRIMARY_ITEMS:
            btn = self._make_nav_btn(key, text)
            nav_lay.addWidget(btn)
        root.addWidget(nav_block)

        root.addStretch(1)

        foot = QWidget()
        fl = QVBoxLayout(foot)
        fl.setContentsMargins(12, 8, 12, 14)
        fl.setSpacing(6)

        self.lbl_expiry = QLabel("到期 —")
        self.lbl_expiry.setObjectName("sideExpiry")
        self.lbl_expiry.setWordWrap(True)
        fl.addWidget(self.lbl_expiry)

        upgrade = QPushButton("基础版（可升级）")
        upgrade.setObjectName("sideUpgrade")
        upgrade.setCursor(Qt.PointingHandCursor)
        upgrade.clicked.connect(lambda: self._on_click(NAV_PRICING))
        self._buttons[NAV_PRICING] = upgrade
        self._upgrade_btn = upgrade
        fl.addWidget(upgrade)

        about_title = QLabel("关于")
        about_title.setObjectName("sideGroupTitle")
        fl.addWidget(about_title)

        for key, text in _ABOUT_ITEMS:
            btn = self._make_nav_btn(key, text, compact=True)
            fl.addWidget(btn)

        ver = QPushButton(f"版本 V{version.lstrip('Vv')}")
        ver.setObjectName("sideNavBtn")
        ver.setCursor(Qt.PointingHandCursor)
        ver.setProperty("navKey", NAV_ABOUT)
        ver.clicked.connect(lambda: self._on_click(NAV_ABOUT))
        self._buttons[NAV_ABOUT] = ver
        fl.addWidget(ver)

        root.addWidget(foot)

    def _make_nav_btn(self, key: str, text: str, *, compact: bool = False) -> QPushButton:
        btn = QPushButton(text)
        btn.setObjectName("sideNavBtn")
        btn.setCursor(Qt.PointingHandCursor)
        btn.setCheckable(True)
        btn.setProperty("navKey", key)
        if compact:
            btn.setProperty("compact", True)
        btn.clicked.connect(lambda checked=False, k=key: self._on_click(k))
        self._buttons[key] = btn
        return btn

    def _on_click(self, key: str) -> None:
        self.set_active(key)
        self.navigated.emit(key)

    def set_active(self, key: str) -> None:
        self._current = key
        for k, btn in self._buttons.items():
            active = k == key
            btn.setChecked(active)
            btn.setProperty("active", active)
            # 强制刷新 QSS 伪属性
            btn.style().unpolish(btn)
            btn.style().polish(btn)

    def current(self) -> str:
        return self._current

    def set_expiry_text(self, text: str, *, urgent: bool = False) -> None:
        self.lbl_expiry.setText(text)
        if urgent:
            self.lbl_expiry.setStyleSheet(f"color: {S.DANGER};")
        else:
            self.lbl_expiry.setStyleSheet("")

    def set_plan_badge(self, *, is_pro: bool) -> None:
        if is_pro:
            self._upgrade_btn.setText("专业版")
        else:
            self._upgrade_btn.setText("基础版（可升级）")
