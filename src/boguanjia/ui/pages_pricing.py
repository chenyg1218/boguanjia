"""收费计划页：基础版 / 专业版 / 旗舰版。"""

from __future__ import annotations

from boguanjia.qt import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    Qt,
    QVBoxLayout,
    QWidget,
    Signal,
)


_FREE_FEATURES = (
    "自动发言、自动弹窗、自动回复都能用",
    "只能登录 1 个账号（适合单店日常跟播）",
    "0 元，无需购买",
)

_PRO_FEATURES = (
    "跟播功能与基础版完全相同",
    "最多 3 个直播账号，可同时在线",
    "29 元 / 月，按卡密天数计费",
)

_FLAGSHIP_FEATURES = (
    "跟播功能与基础版完全相同",
    "直播账号数量无上限",
    "39 元 / 月，按卡密天数计费",
)


class PricingPage(QWidget):
    upgrade_clicked = Signal()

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setObjectName("pageRoot")
        self._is_pro = False
        self._pro_btn: QPushButton = None  # type: ignore
        self._free_badge: QLabel = None  # type: ignore
        self._pro_badge: QLabel = None  # type: ignore
        self._flagship_badge: QLabel = None  # type: ignore
        self._flagship_btn: QPushButton = None  # type: ignore
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        header = QWidget()
        header.setObjectName("pageHeader")
        header.setFixedHeight(52)
        hl = QHBoxLayout(header)
        hl.setContentsMargins(24, 0, 24, 0)
        title = QLabel("收费计划")
        title.setObjectName("pageTitle")
        hl.addWidget(title)
        hl.addStretch(1)
        root.addWidget(header)

        body = QWidget()
        body.setObjectName("pageBody")
        bl = QVBoxLayout(body)
        bl.setContentsMargins(28, 24, 28, 28)
        bl.setSpacing(16)

        sub = QLabel(
            "各档功能一样，区别只在账号数量："
            "基础版 0 元 · 1 个；专业版 29 元/月 · 3 个；旗舰版 39 元/月 · 无上限。"
        )
        sub.setObjectName("pageSubtitle")
        sub.setWordWrap(True)
        bl.addWidget(sub)

        cards = QHBoxLayout()
        cards.setSpacing(16)
        free_card, self._free_badge, self._free_btn = self._plan_card(
            "基础版",
            "当前方案",
            "0 元",
            _FREE_FEATURES,
            primary=False,
            btn_text="当前使用中",
            btn_enabled=False,
        )
        cards.addWidget(free_card, stretch=1)
        pro_card, self._pro_badge, self._pro_btn = self._plan_card(
            "专业版",
            "推荐",
            "29 元 / 月",
            _PRO_FEATURES,
            primary=True,
            btn_text="开通专业版",
            btn_enabled=True,
        )
        self._pro_btn.clicked.connect(self.upgrade_clicked.emit)
        cards.addWidget(pro_card, stretch=1)
        flagship_card, self._flagship_badge, self._flagship_btn = self._plan_card(
            "旗舰版",
            "多账号",
            "39 元 / 月",
            _FLAGSHIP_FEATURES,
            primary=False,
            btn_text="开通旗舰版",
            btn_enabled=True,
        )
        self._flagship_btn.clicked.connect(self.upgrade_clicked.emit)
        cards.addWidget(flagship_card, stretch=1)
        bl.addLayout(cards)
        bl.addStretch(1)
        root.addWidget(body, stretch=1)

    def _plan_card(
        self,
        name: str,
        badge: str,
        price: str,
        features: tuple,
        *,
        primary: bool,
        btn_text: str,
        btn_enabled: bool,
    ):
        card = QFrame()
        card.setObjectName("planCardPrimary" if primary else "planCard")
        lay = QVBoxLayout(card)
        lay.setContentsMargins(20, 20, 20, 20)
        lay.setSpacing(10)

        top = QHBoxLayout()
        name_lbl = QLabel(name)
        name_lbl.setObjectName("planName")
        top.addWidget(name_lbl)
        top.addStretch(1)
        badge_lbl = QLabel(badge)
        badge_lbl.setObjectName("planBadgeHot" if primary else "planBadge")
        top.addWidget(badge_lbl)
        lay.addLayout(top)

        price_lbl = QLabel(price)
        price_lbl.setObjectName("planPrice")
        lay.addWidget(price_lbl)

        for feat in features:
            row = QLabel(f"·  {feat}")
            row.setObjectName("planFeature")
            row.setWordWrap(True)
            lay.addWidget(row)

        lay.addStretch(1)

        btn = QPushButton(btn_text)
        btn.setObjectName("planBtnPrimary" if primary else "planBtn")
        btn.setCursor(Qt.PointingHandCursor)
        btn.setEnabled(btn_enabled)
        lay.addWidget(btn)
        return card, badge_lbl, btn

    def set_plan(self, *, is_pro: bool, expires_at: str = "") -> None:
        self._is_pro = is_pro
        if is_pro:
            self._free_badge.setText("基础方案")
            self._free_btn.setText("可降级使用")
            self._free_btn.setEnabled(False)
            self._pro_badge.setText("已开通")
            tip = f"已开通 · 到期 {expires_at}" if expires_at else "已开通"
            self._pro_btn.setText(tip)
            self._pro_btn.setEnabled(True)  # 仍可续充
            self._flagship_badge.setText("可升级")
            self._flagship_btn.setText("开通旗舰版")
            self._flagship_btn.setEnabled(True)
        else:
            self._free_badge.setText("当前方案")
            self._free_btn.setText("当前使用中")
            self._free_btn.setEnabled(False)
            self._pro_badge.setText("推荐")
            self._pro_btn.setText("开通专业版")
            self._pro_btn.setEnabled(True)
            self._flagship_badge.setText("多账号")
            self._flagship_btn.setText("开通旗舰版")
            self._flagship_btn.setEnabled(True)
