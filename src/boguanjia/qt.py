"""Qt 绑定统一入口（Win7：PySide2 / Qt 5.15）。"""

from __future__ import annotations

import sys

if sys.version_info[:2] != (3, 8):
    raise ImportError(
        "播管家需要 Python 3.8 + PySide2。\n"
        f"当前：Python {sys.version.split()[0]}（{sys.executable}）\n"
        "请使用 run.bat，或激活 conda 环境 live_autocomm。"
    )

try:
    from PySide2.QtCore import QObject, QPoint, Qt, QThread, QTimer, QUrl, Signal, Slot
    from PySide2.QtGui import QCloseEvent, QColor, QFont, QGuiApplication, QIcon, QPainter, QPixmap, QPolygon
    from PySide2.QtWebEngineWidgets import QWebEnginePage, QWebEngineProfile, QWebEngineView
    from PySide2.QtWidgets import (
        QAction,
        QApplication,
        QCheckBox,
        QComboBox,
        QDialog,
        QDialogButtonBox,
        QFileDialog,
        QFormLayout,
        QFrame,
        QHBoxLayout,
        QHeaderView,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMenu,
        QMessageBox,
        QPushButton,
        QScrollArea,
        QSizePolicy,
        QSpinBox,
        QSplitter,
        QStackedWidget,
        QStatusBar,
        QTabWidget,
        QTableWidget,
        QTableWidgetItem,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
except ImportError as exc:
    raise ImportError(
        "未找到 PySide2（Qt 5.15）。请勿使用仅含 PySide6 的解释器。\n"
        f"当前解释器：{sys.executable}\n"
        "修复：run.bat，或 pip install -r requirements.txt（Python 3.8）"
    ) from exc

__all__ = [
    "QAction",
    "QApplication",
    "QCheckBox",
    "QCloseEvent",
    "QColor",
    "QComboBox",
    "QDialog",
    "QDialogButtonBox",
    "QFileDialog",
    "QFont",
    "QFormLayout",
    "QFrame",
    "QGuiApplication",
    "QHBoxLayout",
    "QHeaderView",
    "QIcon",
    "QLabel",
    "QLineEdit",
    "QMainWindow",
    "QMenu",
    "QMessageBox",
    "QObject",
    "QPainter",
    "QPixmap",
    "QPoint",
    "QPolygon",
    "QPushButton",
    "QScrollArea",
    "QSizePolicy",
    "QSpinBox",
    "QSplitter",
    "QStackedWidget",
    "QStatusBar",
    "QTabWidget",
    "QTableWidget",
    "QTableWidgetItem",
    "QTextEdit",
    "QThread",
    "QTimer",
    "QUrl",
    "QVBoxLayout",
    "QWebEnginePage",
    "QWebEngineProfile",
    "QWebEngineView",
    "QWidget",
    "Qt",
    "Signal",
    "Slot",
]
