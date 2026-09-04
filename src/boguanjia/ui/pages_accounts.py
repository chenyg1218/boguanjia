"""账号管理页：列表 / 新增 / 打开 / 删除（工作台由多进程拉起）。"""

from __future__ import annotations

from boguanjia.qt import (
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    Qt,
    QTableWidget,
    QTableWidgetItem,
    QTimer,
    QVBoxLayout,
    QWidget,
    Signal,
)
from boguanjia.ui import dialogs as D


class AccountsPage(QWidget):
    add_clicked = Signal()
    open_clicked = Signal(str)  # profile_id
    delete_clicked = Signal(str)
    refresh_requested = Signal()

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setObjectName("pageRoot")
        self._rows: list = []  # List[dict]
        self._is_pro = False
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        header = QWidget()
        header.setObjectName("pageHeader")
        header.setFixedHeight(52)
        hl = QHBoxLayout(header)
        hl.setContentsMargins(24, 0, 24, 0)
        hl.setSpacing(10)

        title = QLabel("账号管理")
        title.setObjectName("pageTitle")
        hl.addWidget(title)
        hl.addStretch(1)

        self.btn_refresh = QPushButton("刷新")
        self.btn_refresh.setObjectName("pageSecondaryBtn")
        self.btn_refresh.setCursor(Qt.PointingHandCursor)
        self.btn_refresh.clicked.connect(self._emit_refresh_only)
        hl.addWidget(self.btn_refresh)

        self.btn_add = QPushButton("新增账号")
        self.btn_add.setObjectName("pagePrimaryBtn")
        self.btn_add.setCursor(Qt.PointingHandCursor)
        self.btn_add.clicked.connect(self.add_clicked.emit)
        hl.addWidget(self.btn_add)
        root.addWidget(header)

        body = QWidget()
        body.setObjectName("pageBody")
        bl = QVBoxLayout(body)
        bl.setContentsMargins(24, 18, 24, 24)
        bl.setSpacing(12)

        self.hint = QLabel("")
        self.hint.setObjectName("pageSubtitle")
        self.hint.setWordWrap(True)
        bl.addWidget(self.hint)

        self.table = QTableWidget(0, 4)
        self.table.setObjectName("accountsTable")
        self.table.setHorizontalHeaderLabels(["账号名称", "状态", "类型", "操作"])
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table.horizontalHeader().setDefaultAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        self.table.verticalHeader().setVisible(False)
        self.table.verticalHeader().setDefaultSectionSize(48)
        self.table.setEditTriggers(self.table.NoEditTriggers)
        self.table.setSelectionBehavior(self.table.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        self.table.setFocusPolicy(Qt.NoFocus)
        bl.addWidget(self.table)
        root.addWidget(body, stretch=1)

        self._poll = QTimer(self)
        self._poll.setInterval(2000)
        self._poll.timeout.connect(self.refresh_requested.emit)

    def showEvent(self, event) -> None:
        super().showEvent(event)
        if not self._poll.isActive():
            self._poll.start()
        self.refresh_requested.emit()

    def hideEvent(self, event) -> None:
        self._poll.stop()
        super().hideEvent(event)

    def _emit_refresh_only(self) -> None:
        self.refresh_requested.emit()

    def set_plan(self, *, is_pro: bool) -> None:
        self._is_pro = is_pro
        if is_pro:
            self.hint.setText("专业版：可为每个快手小店账号单独打开工作台窗口（同时多开）。")
            self.btn_add.setEnabled(True)
            self.btn_add.setToolTip("")
        else:
            self.hint.setText(
                "免费版仅支持 1 个账号。激活卡密后可新增账号并同时多开工作台。"
            )
            self.btn_add.setEnabled(True)  # 点击后引导升级
            self.btn_add.setToolTip("升级专业版后可新增")

    def set_rows(self, rows: list) -> None:
        """
        rows: [{id, name, status, kind, can_delete}]
        """
        self._rows = list(rows or [])
        self.table.setRowCount(0)
        for row in self._rows:
            r = self.table.rowCount()
            self.table.insertRow(r)
            self.table.setItem(r, 0, QTableWidgetItem(str(row.get("name") or "")))
            self.table.setItem(r, 1, QTableWidgetItem(str(row.get("status") or "")))
            self.table.setItem(r, 2, QTableWidgetItem(str(row.get("kind") or "")))

            cell = QWidget()
            lay = QHBoxLayout(cell)
            lay.setContentsMargins(8, 6, 8, 6)
            lay.setSpacing(8)
            pid = str(row.get("id") or "")
            btn_open = QPushButton("打开")
            btn_open.setObjectName("tableBtn")
            btn_open.setCursor(Qt.PointingHandCursor)
            btn_open.clicked.connect(lambda _=False, i=pid: self.open_clicked.emit(i))
            lay.addWidget(btn_open)
            btn_del = QPushButton("删除")
            btn_del.setObjectName("tableBtnDanger")
            btn_del.setCursor(Qt.PointingHandCursor)
            can_del = bool(row.get("can_delete"))
            btn_del.setEnabled(can_del)
            if not can_del:
                btn_del.setToolTip(str(row.get("delete_tip") or "不可删除"))
            btn_del.clicked.connect(lambda _=False, i=pid: self._confirm_delete(i))
            lay.addWidget(btn_del)
            lay.addStretch(1)
            self.table.setCellWidget(r, 3, cell)

    def _confirm_delete(self, profile_id: str) -> None:
        name = profile_id
        for row in self._rows:
            if row.get("id") == profile_id:
                name = str(row.get("name") or profile_id)
                break
        if not D.question(self, "删除账号", f"确定删除「{name}」？\n登录态与跟播设置将一并清除，且不可恢复。"):
            return
        self.delete_clicked.emit(profile_id)
