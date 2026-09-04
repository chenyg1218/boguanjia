"""卡密激活 / 续充（无注册、无账号密码）。"""

from __future__ import annotations

from boguanjia import auth
from boguanjia.models import AccountState
from boguanjia.qt import (
    QDialog,
    QGuiApplication,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QObject,
    QPushButton,
    Qt,
    QThread,
    QVBoxLayout,
    Signal,
    Slot,
)
from boguanjia.storage import load_account
from boguanjia.ui import dialogs as D
from boguanjia.ui import styles as S
from boguanjia.ui.icons import apply_window_icon


class _RedeemWorker(QObject):
    finished = Signal(bool, str, object)  # ok, msg, AccountState

    def __init__(self, card: str, account: AccountState) -> None:
        super().__init__()
        self._card = card
        self._account = account

    @Slot()
    def run(self) -> None:
        try:
            ok, msg, state = auth.activate_or_renew(self._card, self._account)
            self.finished.emit(ok, msg, state)
        except Exception as exc:  # noqa: BLE001 — 展示给用户
            self.finished.emit(False, f"激活异常：{exc}", self._account)


class LicenseWindow(QDialog):
    """单入口：激活或未到期续充。续充时以模态弹窗打开，避免点穿主界面。"""

    activated = Signal(object)  # AccountState

    def __init__(self, parent=None, *, as_dialog: bool = False) -> None:
        super().__init__(parent)
        self._as_dialog = as_dialog
        self.setWindowTitle("播管家")
        self.setObjectName("LicenseRoot")
        self.setFixedSize(560, 380)
        self.setStyleSheet(S.license_qss())
        # 去掉标题栏「？」；保留关闭按钮。续充时做独立模态窗，避免点穿主界面。
        flags = (
            Qt.Dialog
            | Qt.WindowTitleHint
            | Qt.WindowCloseButtonHint
            | Qt.WindowSystemMenuHint
        )
        if as_dialog:
            self.setModal(True)
            self.setWindowModality(Qt.ApplicationModal)
        self.setWindowFlags(flags)
        apply_window_icon(self)
        self._account = load_account()
        self._thread = None
        self._worker = None
        self._build()
        self._refresh_status()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        apply_window_icon(self)

    def _build(self) -> None:
        root = QVBoxLayout(self)
        root.setContentsMargins(32, 24, 32, 28)
        root.setSpacing(12)

        brand = QLabel("播管家")
        brand.setObjectName("brandTitle")
        root.addWidget(brand)

        cfg = auth.load_license_config()
        text = str(cfg.get("announcement") or self._account.announcement or "").strip()
        if not text:
            text = (
                "购买卡密后在此激活；未到期续充将叠加剩余时长。\n"
                "卡密购买：https://www.zaofaka.com/links/1CD589E2"
            )
        ann_cap = QLabel("公告")
        ann_cap.setObjectName("secLabel")
        self.ann = QLabel(text)
        self.ann.setObjectName("annBody")
        self.ann.setWordWrap(True)
        self.ann.setTextInteractionFlags(Qt.TextSelectableByMouse)
        root.addWidget(ann_cap)
        root.addWidget(self.ann)

        self.lbl_status = QLabel()
        self.lbl_status.setObjectName("statusBadge")
        self.lbl_status.setWordWrap(True)
        root.addWidget(self.lbl_status)

        row_cap = QLabel("卡密")
        row_cap.setObjectName("secLabel")
        root.addWidget(row_cap)

        self.ed_card = QLineEdit()
        self.ed_card.setObjectName("cardInput")
        self.ed_card.setPlaceholderText("粘贴购买的卡密，回车也可激活")
        self.ed_card.returnPressed.connect(self._do_activate)
        root.addWidget(self.ed_card)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(12)
        self.btn_activate = QPushButton("激活")
        self.btn_activate.setObjectName("activateBtn")
        self.btn_activate.setCursor(Qt.PointingHandCursor)
        self.btn_activate.clicked.connect(self._do_activate)
        btn_row.addWidget(self.btn_activate, 1)

        self.btn_cancel = None
        if self._as_dialog:
            self.btn_cancel = QPushButton("取消")
            self.btn_cancel.setObjectName("cancelBtn")
            self.btn_cancel.setCursor(Qt.PointingHandCursor)
            self.btn_cancel.clicked.connect(self.reject)
            btn_row.addWidget(self.btn_cancel, 1)

        root.addLayout(btn_row)
        root.addStretch(1)

    def keyPressEvent(self, event) -> None:
        # 启动激活窗忽略 Esc，避免关掉后无主界面；标题栏关闭仍走 reject/closeEvent
        if not self._as_dialog and event.key() == Qt.Key_Escape:
            event.accept()
            return
        super().keyPressEvent(event)

    def reject(self) -> None:
        """续充可取消。启动态激活窗关闭时不再强制退出（允许免费版使用）。"""
        if self._thread is not None and self._thread.isRunning():
            return
        super().reject()

    def _set_status(self, text: str, *, kind: str) -> None:
        colors = {
            "ok": (S.SUCCESS, S.SUCCESS_BG),
            "warn": (S.WARN, S.WARN_BG),
            "err": (S.DANGER, S.DANGER_BG),
            "info": (S.TEXT, S.INFO_BG),
        }
        fg, bg = colors.get(kind, colors["info"])
        self.lbl_status.setText(text)
        self.lbl_status.setStyleSheet(
            f"QLabel#statusBadge {{ color: {fg}; background: {bg}; }}"
        )

    def _refresh_status(self) -> None:
        self._account = load_account()
        if auth.is_license_valid(self._account):
            self._set_status(f"授权有效 · 到期 {self._account.expires_at}", kind="ok")
            self.btn_activate.setText("续充")
        elif self._account.expires_at and auth.token_matches(self._account):
            self._set_status(f"已过期（{self._account.expires_at}），请续充", kind="warn")
            self.btn_activate.setText("续充")
        else:
            self._set_status("尚未激活，请输入卡密", kind="info")
            self.btn_activate.setText("激活")

    def _set_busy(self, busy: bool) -> None:
        self.btn_activate.setEnabled(not busy)
        self.ed_card.setEnabled(not busy)
        if self.btn_cancel is not None:
            self.btn_cancel.setEnabled(not busy)

    def _do_activate(self) -> None:
        if self._thread is not None and self._thread.isRunning():
            return
        card = self.ed_card.text().strip()
        if not card:
            D.warning(self, "提示", "请输入卡密")
            self.ed_card.setFocus()
            return

        QGuiApplication.setOverrideCursor(Qt.WaitCursor)
        self._set_busy(True)
        self._set_status("正在核销卡密…", kind="info")

        thread = QThread(self)
        worker = _RedeemWorker(card, self._account)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(self._on_redeem_finished)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)
        thread.finished.connect(self._clear_redeem_thread)
        self._thread = thread
        self._worker = worker
        thread.start()

    @Slot()
    def _clear_redeem_thread(self) -> None:
        self._thread = None
        self._worker = None

    @Slot(bool, str, object)
    def _on_redeem_finished(self, ok: bool, msg: str, state: object) -> None:
        QGuiApplication.restoreOverrideCursor()
        self._set_busy(False)

        if not isinstance(state, AccountState):
            state = self._account

        if not ok:
            D.warning(self, "激活失败", msg)
            self._refresh_status()
            return

        self._account = state
        self.ed_card.clear()
        self._refresh_status()
        D.info(self, "成功", msg)

        if self._as_dialog:
            self.activated.emit(state)
            self.accept()
            return

        if auth.is_license_valid(state):
            # 必须用 accept()：close() 会走 reject → 误 quit 整个应用
            self.activated.emit(state)
            self.accept()
