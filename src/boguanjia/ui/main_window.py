"""已废弃：V2 桌面端见仓库 desktop/。"""

from boguanjia.qt import QMainWindow, QLabel, QVBoxLayout, QWidget


class MainWindow(QMainWindow):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__()
        w = QWidget()
        lay = QVBoxLayout(w)
        lay.addWidget(
            QLabel(
                "播管家桌面端已迁移至 desktop/（Electron 外置中控台）。\n"
                "请使用：cd desktop && pnpm install && pnpm dev"
            )
        )
        self.setCentralWidget(w)
        self.setWindowTitle("播管家（已迁移）")
