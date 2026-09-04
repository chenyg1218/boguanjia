"""界面样式 — 主色 #326BFB + 浅灰底现代风。"""

from __future__ import annotations

from typing import Dict, Mapping, Optional

# ── 主色蓝 + 浅灰底 ───────────────────────────────────────
INK = "#0F172A"
GRAY = "#64748B"
BLUE = "#326BFB"

PRIMARY = BLUE
PRIMARY_HOVER = "#2557D6"
PRIMARY_SOFT = "#E8EFFE"
HEADER = "#326BFB"
HEADER_MUTED = "#C9D8FE"
BG = "#F4F6FA"
PANEL = "#FFFFFF"
PANEL_ALT = "#F8FAFC"
BORDER = "#E5E9F2"
BORDER_SOFT = "#EEF1F6"
TEXT = INK
MUTED = GRAY
DANGER = "#F43F5E"
DANGER_HOVER = "#E11D48"
DANGER_BG = "#FFE4E6"
SUCCESS = BLUE
SUCCESS_HOVER = PRIMARY_HOVER
SUCCESS_BG = PRIMARY_SOFT
WARN = "#F59E0B"
WARN_BG = "#FEF3C7"
INFO_BG = PRIMARY_SOFT
# 运行日志：黑底白字控制台
LOG_BG = "#0B1220"
LOG_FG = "#FFFFFF"
LOG_ACCENT = "#E2E8F0"
STOP = "#94A3B8"
STOP_HOVER = "#64748B"
FOCUS = BLUE
RADIUS = "8px"
RADIUS_SM = "6px"
FONT = '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif'
FONT_MONO = 'Consolas, "Cascadia Mono", "Courier New", monospace'

# 左侧导航
SIDEBAR_BG = "#0F172A"
SIDEBAR_EDGE = "#1E293B"
SIDEBAR_TEXT = "#CBD5E1"
SIDEBAR_MUTED = "#94A3B8"
SIDEBAR_HOVER = "#1E293B"
SIDEBAR_ACTIVE = "#1E3A8A"
SIDEBAR_ACCENT = "#326BFB"


def app_base_qss() -> str:
    return f"""
    * {{
        font-family: {FONT};
    }}
    QMainWindow, QDialog {{
        background: {BG};
        color: {TEXT};
    }}
    QWidget {{
        color: {TEXT};
    }}
    QMenuBar {{
        background: transparent;
        border: none;
        max-height: 0;
        min-height: 0;
        padding: 0;
        margin: 0;
    }}
    QMenuBar::item {{
        max-height: 0;
        padding: 0;
        margin: 0;
    }}
    QMenu {{
        background: {PANEL};
        color: {TEXT};
        border: 1px solid {BORDER};
        border-radius: {RADIUS_SM};
        padding: 4px;
        font-size: 12px;
    }}
    QMenu::item {{
        padding: 7px 22px 7px 14px;
        border-radius: 4px;
    }}
    QMenu::item:selected {{
        background: {PRIMARY_SOFT};
        color: {TEXT};
    }}
    QStatusBar {{
        background: {PANEL};
        color: {MUTED};
        border-top: 1px solid {BORDER};
        font-size: 12px;
        min-height: 22px;
        padding-left: 8px;
    }}
    QStatusBar::item {{ border: none; }}
    QToolTip {{
        background: {INK};
        color: #F8FAFC;
        border: none;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
    }}
    QMessageBox {{ background: {PANEL}; }}
    QMessageBox QLabel {{
        color: {TEXT};
        font-size: 13px;
    }}
    QMessageBox QPushButton {{
        background: {PRIMARY};
        color: #FFFFFF;
        border: none;
        padding: 7px 16px;
        border-radius: {RADIUS_SM};
        font-size: 12px;
        font-weight: 600;
        min-width: 72px;
        min-height: 28px;
    }}
    QMessageBox QPushButton:hover {{ background: {PRIMARY_HOVER}; }}
    QMessageBox QPushButton:pressed {{ background: #1E4BC7; }}
    QMessageBox QPushButton:disabled {{
        background: {BORDER};
        color: {MUTED};
    }}
    QScrollBar:vertical {{
        background: transparent;
        width: 8px;
        margin: 2px;
    }}
    QScrollBar::handle:vertical {{
        background: #C5D4F5;
        border-radius: 4px;
        min-height: 28px;
    }}
    QScrollBar::handle:vertical:hover {{ background: {BLUE}; }}
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
    QScrollBar:horizontal {{
        background: transparent;
        height: 8px;
        margin: 2px;
    }}
    QScrollBar::handle:horizontal {{
        background: #C5D4F5;
        border-radius: 4px;
        min-width: 28px;
    }}
    QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{ width: 0; }}
    """


def main_window_qss() -> str:
    return f"""
    QMainWindow {{ background: {BG}; }}

    /* ── 左侧导航 ── */
    QWidget#sideNav {{
        background: {SIDEBAR_BG};
        border: none;
    }}
    QWidget#sideBrand {{
        background: {SIDEBAR_BG};
        border-bottom: 1px solid {SIDEBAR_EDGE};
    }}
    QLabel#sideBrandTitle {{
        color: #F8FAFC;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 1.5px;
        background: transparent;
        border: none;
    }}
    QLabel#sideGroupTitle {{
        color: {SIDEBAR_MUTED};
        font-size: 11px;
        font-weight: 600;
        padding: 12px 12px 4px 12px;
        background: transparent;
        border: none;
    }}
    QLabel#sideExpiry {{
        color: {SIDEBAR_MUTED};
        font-size: 11px;
        padding: 0 12px 6px 12px;
        background: transparent;
        border: none;
    }}
    QPushButton#sideNavBtn {{
        background: transparent;
        color: {SIDEBAR_TEXT};
        border: none;
        border-radius: {RADIUS_SM};
        text-align: left;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 500;
    }}
    QPushButton#sideNavBtn:hover {{
        background: {SIDEBAR_HOVER};
        color: #FFFFFF;
    }}
    QPushButton#sideNavBtn[active="true"] {{
        background: rgba(50, 107, 251, 0.22);
        color: #FFFFFF;
        font-weight: 700;
        border-left: 3px solid {SIDEBAR_ACCENT};
        padding-left: 11px;
    }}
    QPushButton#sideUpgrade {{
        background: rgba(50, 107, 251, 0.18);
        color: #F8FAFC;
        border: 1px solid rgba(50, 107, 251, 0.35);
        border-radius: {RADIUS_SM};
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        text-align: left;
    }}
    QPushButton#sideUpgrade:hover {{
        background: rgba(50, 107, 251, 0.32);
        border-color: {SIDEBAR_ACCENT};
    }}
    QPushButton#sideUpgrade[active="true"] {{
        background: rgba(50, 107, 251, 0.35);
        border-color: {SIDEBAR_ACCENT};
        color: #FFFFFF;
    }}

    /* ── 内容页公共 ── */
    QWidget#pageRoot {{
        background: {BG};
    }}
    QWidget#pageBody {{
        background: {BG};
    }}
    QWidget#pageHeader {{
        background: {PANEL};
        border-bottom: 1px solid {BORDER};
    }}
    QLabel#pageTitle {{
        color: {TEXT};
        font-size: 16px;
        font-weight: 700;
        background: transparent;
        border: none;
    }}
    QLabel#pageHint {{
        color: {MUTED};
        font-size: 12px;
        background: transparent;
        border: none;
    }}
    QLabel#pageSubtitle {{
        color: {MUTED};
        font-size: 13px;
        background: transparent;
        border: none;
        padding: 0 0 4px 0;
    }}
    QPushButton#pagePrimaryBtn {{
        background: {PRIMARY};
        color: #FFFFFF;
        border: none;
        padding: 7px 16px;
        border-radius: {RADIUS_SM};
        font-size: 12px;
        font-weight: 600;
        min-height: 30px;
    }}
    QPushButton#pagePrimaryBtn:hover {{ background: {PRIMARY_HOVER}; }}
    QPushButton#pageSecondaryBtn {{
        background: {PANEL};
        color: {TEXT};
        border: 1px solid {BORDER};
        padding: 7px 16px;
        border-radius: {RADIUS_SM};
        font-size: 12px;
        font-weight: 500;
        min-height: 30px;
    }}
    QPushButton#pageSecondaryBtn:hover {{
        background: {PRIMARY_SOFT};
        border-color: #C5D4F5;
        color: {PRIMARY};
    }}

    /* ── 账号表格 ── */
    QTableWidget#accountsTable {{
        background: {PANEL};
        gridline-color: transparent;
        border: 1px solid {BORDER};
        border-radius: {RADIUS};
        color: {TEXT};
        font-size: 13px;
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
        alternate-background-color: {PANEL_ALT};
        outline: none;
        padding: 2px;
    }}
    QTableWidget#accountsTable::item {{
        padding: 8px 12px;
        border: none;
    }}
    QTableWidget#accountsTable::item:selected {{
        background: {PRIMARY_SOFT};
        color: {TEXT};
    }}
    QTableWidget#accountsTable QHeaderView::section {{
        background: {PANEL_ALT};
        padding: 10px 12px;
        border: none;
        border-bottom: 1px solid {BORDER};
        border-right: none;
        font-weight: 600;
        font-size: 12px;
        color: {MUTED};
    }}
    QPushButton#tableBtn {{
        background: {PANEL};
        color: {PRIMARY};
        border: 1px solid #C5D4F5;
        border-radius: {RADIUS_SM};
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 600;
        min-height: 26px;
        min-width: 52px;
    }}
    QPushButton#tableBtn:hover {{
        background: {PRIMARY_SOFT};
        border-color: {PRIMARY};
    }}
    QPushButton#tableBtnDanger {{
        background: {PANEL};
        color: {DANGER};
        border: 1px solid #FECDD3;
        border-radius: {RADIUS_SM};
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 600;
        min-height: 26px;
        min-width: 52px;
    }}
    QPushButton#tableBtnDanger:hover {{
        background: {DANGER_BG};
        border-color: {DANGER};
    }}
    QPushButton#tableBtnDanger:disabled {{
        color: {MUTED};
        border-color: {BORDER};
        background: {PANEL_ALT};
    }}

    /* ── 收费计划卡片 ── */
    QFrame#planCard, QFrame#planCardPrimary {{
        background: {PANEL};
        border: 1px solid {BORDER};
        border-radius: 10px;
    }}
    QFrame#planCardPrimary {{
        border: 1px solid {PRIMARY};
        background: {PRIMARY_SOFT};
    }}
    QLabel#planName {{
        color: {TEXT};
        font-size: 16px;
        font-weight: 700;
        background: transparent;
        border: none;
    }}
    QLabel#planPrice {{
        color: {TEXT};
        font-size: 22px;
        font-weight: 700;
        background: transparent;
        border: none;
        padding: 4px 0 8px 0;
    }}
    QLabel#planFeature {{
        color: {TEXT};
        font-size: 13px;
        background: transparent;
        border: none;
        padding: 2px 0;
    }}
    QLabel#planBadge, QLabel#planBadgeHot {{
        color: {MUTED};
        font-size: 11px;
        background: {PANEL_ALT};
        border-radius: {RADIUS_SM};
        padding: 2px 8px;
    }}
    QLabel#planBadgeHot {{
        color: #FFFFFF;
        background: {PRIMARY};
    }}
    QPushButton#planBtn, QPushButton#planBtnPrimary {{
        background: {PANEL};
        color: {TEXT};
        border: 1px solid {BORDER};
        border-radius: {RADIUS_SM};
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 600;
        min-height: 28px;
    }}
    QPushButton#planBtn:hover {{ background: {PANEL_ALT}; }}
    QPushButton#planBtn:disabled {{
        color: {MUTED};
        background: {PANEL_ALT};
    }}
    QPushButton#planBtnPrimary {{
        background: {PRIMARY};
        color: #FFFFFF;
        border: 1px solid {PRIMARY};
    }}
    QPushButton#planBtnPrimary:hover {{ background: {PRIMARY_HOVER}; }}

    QSplitter::handle:vertical {{
        background: {BORDER};
        height: 2px;
    }}
    QSplitter::handle:vertical:hover {{
        background: {BLUE};
    }}
    """


def license_qss() -> str:
    return f"""
    QDialog#LicenseRoot, QWidget#LicenseRoot {{
        background: {BG};
        color: {TEXT};
    }}
    QLabel#brandTitle {{
        color: {TEXT};
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.5px;
        background: transparent;
        border: none;
    }}
    QLabel#secLabel {{
        font-size: 12px;
        font-weight: 600;
        color: {MUTED};
        background: transparent;
        border: none;
    }}
    QLabel#annBody {{
        font-size: 13px;
        color: {TEXT};
        background: {PANEL};
        border: 1px solid {BORDER};
        border-radius: {RADIUS};
        padding: 10px 12px;
    }}
    QLabel#statusBadge {{
        font-size: 13px;
        border-radius: {RADIUS};
        padding: 8px 10px;
    }}
    QLineEdit#cardInput {{
        padding: 10px 12px;
        border: 1px solid {BORDER};
        border-radius: {RADIUS_SM};
        background: {PANEL};
        color: {TEXT};
        font-size: 14px;
        min-height: 20px;
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
    }}
    QLineEdit#cardInput:focus {{
        border: 1px solid {FOCUS};
    }}
    QPushButton#activateBtn {{
        background: {PRIMARY};
        color: white;
        border: none;
        padding: 10px 18px;
        border-radius: {RADIUS_SM};
        font-size: 14px;
        font-weight: 700;
        min-height: 22px;
    }}
    QPushButton#activateBtn:hover {{ background: {PRIMARY_HOVER}; }}
    QPushButton#activateBtn:disabled {{
        background: {BORDER};
        color: {MUTED};
    }}
    QPushButton#cancelBtn {{
        background: {PANEL};
        color: {TEXT};
        border: 1px solid {BORDER};
        padding: 10px 18px;
        border-radius: {RADIUS_SM};
        font-size: 14px;
        font-weight: 600;
        min-height: 22px;
    }}
    QPushButton#cancelBtn:hover {{ background: {PANEL_ALT}; }}
    QPushButton#cancelBtn:pressed {{ background: {BORDER}; }}
    QPushButton#cancelBtn:disabled {{
        color: {MUTED};
        background: {PANEL_ALT};
    }}
    """


def ops_qss(arrows: Optional[Mapping[str, str]] = None) -> str:
    a: Dict[str, str] = dict(arrows or {})
    arrow_up = a.get("up", "")
    arrow_down = a.get("down", "")
    arrow_combo = a.get("combo", "")
    return f"""
    QWidget#opsRoot {{
        background: {BG};
        border-top: 1px solid {BORDER};
    }}
    QLabel#secTitle {{
        color: {MUTED};
        font-size: 12px;
        font-weight: 600;
        border: none;
        background: transparent;
    }}
    QTabWidget::pane {{
        border: none;
        background: {BG};
        top: -1px;
    }}
    QTabBar::tab {{
        background: transparent;
        color: {MUTED};
        padding: 8px 14px;
        margin-right: 2px;
        border: none;
        border-bottom: 2px solid transparent;
        font-size: 12px;
    }}
    QTabBar::tab:hover {{ color: {TEXT}; }}
    QTabBar::tab:selected {{
        color: {TEXT};
        font-weight: 700;
        border-bottom: 2px solid {BLUE};
    }}
    QPushButton {{
        background: {PRIMARY};
        color: #FFFFFF;
        border: none;
        padding: 6px 12px;
        border-radius: {RADIUS_SM};
        font-size: 12px;
    }}
    QPushButton:hover {{ background: {PRIMARY_HOVER}; }}
    QPushButton:pressed {{ background: #1E4BC7; }}
    QPushButton:disabled {{
        background: {BORDER};
        color: {MUTED};
    }}
    QPushButton#btnGhost {{
        background: {PANEL};
        color: {TEXT};
        border: 1px solid {BORDER};
    }}
    QPushButton#btnGhost:hover {{ background: {PANEL_ALT}; }}
    QPushButton#btnGhost:pressed {{ background: {BORDER}; }}
    QPushButton#btnExtract {{
        background: {PRIMARY};
        color: #FFFFFF;
        border: none;
        font-weight: 700;
        padding: 8px 10px;
        border-radius: {RADIUS_SM};
    }}
    QPushButton#btnExtract:hover {{ background: {PRIMARY_HOVER}; }}
    QPushButton#btnStop {{
        background: {STOP};
        color: #FFFFFF;
        border: 1px solid {STOP};
        border-radius: {RADIUS_SM};
        font-weight: 600;
        min-height: 32px;
        max-height: 32px;
        padding: 0 10px;
    }}
    QPushButton#btnStop:hover {{ background: {STOP_HOVER}; border-color: {STOP_HOVER}; }}
    QPushButton#btnStop:disabled {{
        background: {BORDER};
        border-color: {BORDER};
        color: {MUTED};
    }}
    QPushButton#btnStart {{
        font-weight: 700;
        min-height: 32px;
        max-height: 32px;
        padding: 0 10px;
        background: {PRIMARY};
        border: 1px solid {PRIMARY};
        border-radius: {RADIUS_SM};
    }}
    QPushButton#btnStart:hover {{ background: {PRIMARY_HOVER}; border-color: {PRIMARY_HOVER}; }}
    QPushButton#btnStart:disabled {{
        background: {PRIMARY_SOFT};
        border-color: {PRIMARY_SOFT};
        color: {PRIMARY_HOVER};
    }}
    QPushButton#btnSave {{
        background: {PANEL};
        color: {TEXT};
        border: 1px solid {BORDER};
        font-weight: 600;
        min-height: 32px;
        max-height: 32px;
        padding: 0 10px;
        border-radius: {RADIUS_SM};
    }}
    QPushButton#btnSave:hover {{ background: {PANEL_ALT}; }}
    QPushButton#btnSave:pressed {{ background: {BORDER}; }}
    QLabel#helpIcon {{
        background: {PRIMARY};
        color: #FFFFFF;
        border-radius: 6px;
        font-size: 9px;
        font-weight: 700;
        min-width: 12px;
        max-width: 12px;
        min-height: 12px;
        max-height: 12px;
        padding: 0;
        margin: 0;
    }}
    QLineEdit, QComboBox, QSpinBox {{
        padding: 4px 8px;
        border: 1px solid {BORDER};
        border-radius: {RADIUS_SM};
        background: {PANEL};
        color: {TEXT};
        min-height: 24px;
        font-size: 12px;
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
    }}
    QLineEdit:focus, QComboBox:focus, QSpinBox:focus {{
        border: 1px solid {FOCUS};
    }}
    QComboBox {{
        min-height: 28px;
        padding: 2px 8px;
    }}
    QComboBox::drop-down {{
        subcontrol-origin: padding;
        subcontrol-position: center right;
        width: 24px;
        border: none;
    }}
    QComboBox QAbstractItemView {{
        padding: 2px;
        outline: none;
        background: {PANEL};
        border: 1px solid {BORDER};
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
    }}
    QSpinBox {{
        min-height: 26px;
        padding: 4px 6px;
    }}
    QFrame#rail QSpinBox#railSpin,
    QFrame#rail QComboBox#railCombo,
    QFrame#rail QComboBox#railComboTiny,
    QFrame#rail QLineEdit#railEdit {{
        min-height: 20px;
        max-height: 22px;
        padding: 0px 5px;
        font-size: 12px;
        border-radius: {RADIUS_SM};
    }}
    QFrame#rail QSpinBox#railSpin {{ padding-right: 2px; }}
    QFrame#rail QSpinBox#railSpin::up-button,
    QFrame#rail QSpinBox#railSpin::down-button {{
        width: 14px;
        border-left: 1px solid {BORDER};
        background: {PANEL_ALT};
    }}
    QFrame#rail QSpinBox#railSpin::up-button {{
        subcontrol-origin: border;
        subcontrol-position: top right;
        border-top-right-radius: 2px;
    }}
    QFrame#rail QSpinBox#railSpin::down-button {{
        subcontrol-origin: border;
        subcontrol-position: bottom right;
        border-bottom-right-radius: 2px;
    }}
    QFrame#rail QSpinBox#railSpin::up-arrow {{
        image: url("{arrow_up}");
        width: 7px;
        height: 7px;
    }}
    QFrame#rail QSpinBox#railSpin::down-arrow {{
        image: url("{arrow_down}");
        width: 7px;
        height: 7px;
    }}
    QFrame#rail QComboBox#railCombo {{
        padding: 0px 16px 0px 5px;
        /* 宽度以较长模式名「顺序讲解（默认全部）」为基准 */
        min-width: 188px;
        max-width: 188px;
    }}
    QFrame#rail QComboBox#railComboTiny {{
        /* 覆盖全局 QComboBox min-height:28，避免文字偏上 */
        padding: 0px 14px 0px 4px;
        min-width: 52px;
        max-width: 52px;
    }}
    QFrame#rail QComboBox#railComboTiny::drop-down {{
        subcontrol-origin: padding;
        subcontrol-position: center right;
        width: 12px;
        border: none;
    }}
    QFrame#rail QComboBox#railComboTiny::down-arrow {{
        image: url("{arrow_combo}");
        width: 8px;
        height: 8px;
    }}
    QFrame#rail QComboBox#railComboTiny QAbstractItemView {{
        padding: 2px;
        outline: none;
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
    }}
    QFrame#rail QComboBox#railComboTiny QAbstractItemView::item {{
        min-height: 22px;
        max-height: 22px;
        padding: 1px 6px;
    }}
    QFrame#rail QLabel#intervalSep {{
        color: {MUTED};
        font-size: 12px;
        border: none;
        background: transparent;
        padding: 0 1px;
    }}
    QFrame#rail QComboBox#railCombo::drop-down {{
        subcontrol-origin: padding;
        subcontrol-position: center right;
        width: 14px;
        border: none;
    }}
    QFrame#rail QComboBox#railCombo::down-arrow {{
        image: url("{arrow_combo}");
        width: 8px;
        height: 8px;
    }}
    QFrame#rail QComboBox#railCombo QAbstractItemView {{
        padding: 2px;
        outline: none;
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
    }}
    QFrame#rail QComboBox#railCombo QAbstractItemView::item {{
        min-height: 22px;
        max-height: 22px;
        padding: 1px 6px;
    }}
    QLabel#fieldLabel {{
        color: {MUTED};
        font-size: 12px;
        border: none;
        background: transparent;
        min-width: 64px;
    }}
    QLabel#fieldLabelCompact {{
        color: {MUTED};
        font-size: 12px;
        border: none;
        background: transparent;
        min-width: 0;
    }}
    QTextEdit#danmu {{
        background: {PANEL};
        border: 1px solid {BORDER};
        border-radius: {RADIUS};
        color: {TEXT};
        padding: 8px;
        font-size: 12px;
        selection-background-color: {PRIMARY_SOFT};
    }}
    QTextEdit#danmu:focus {{
        border: 1px solid {FOCUS};
    }}
    QTextEdit#log {{
        background: {LOG_BG};
        color: {LOG_ACCENT};
        font-family: {FONT_MONO};
        font-size: 12px;
        border: 1px solid {BORDER};
        border-radius: {RADIUS};
        padding: 8px;
    }}
    QTableWidget {{
        background: {PANEL};
        gridline-color: {BORDER_SOFT};
        border: 1px solid {BORDER};
        border-radius: {RADIUS};
        color: {TEXT};
        font-size: 12px;
        selection-background-color: {PRIMARY_SOFT};
        selection-color: {TEXT};
        alternate-background-color: {PANEL_ALT};
        outline: none;
    }}
    QTableWidget::item {{ padding: 4px 6px; }}
    QTableWidget::item:selected {{
        background: {PRIMARY_SOFT};
        color: {TEXT};
    }}
    QHeaderView::section {{
        background: {PANEL_ALT};
        padding: 6px 8px;
        border: none;
        border-right: 1px solid {BORDER};
        border-bottom: 1px solid {BORDER};
        font-weight: 600;
        font-size: 12px;
        color: {MUTED};
    }}
    QFrame#rail {{
        background: {PANEL};
        border-left: 1px solid {BORDER};
    }}
    QFrame#divider {{
        background: {BORDER};
        max-height: 1px;
        border: none;
    }}
    QCheckBox {{
        spacing: 6px;
        color: {TEXT};
        font-size: 12px;
        min-height: 20px;
    }}
    """
