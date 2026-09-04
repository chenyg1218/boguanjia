"""应用图标加载。"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

from boguanjia.paths import APP_USER_MODEL_ID, app_icon_path, data_dir
from boguanjia.qt import QColor, QIcon, QPainter, QPixmap, QPoint, QPolygon, Qt, QWidget

_cached: Optional[QIcon] = None
_arrow_cache: Optional[Dict[str, str]] = None
_hicons: Optional[Tuple[int, int]] = None


def set_windows_app_id() -> None:
    """让任务栏把本进程当成独立应用，使用窗口图标而不是解释器图标。"""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
    except Exception:
        pass


def app_icon() -> QIcon:
    """窗口 / 任务栏图标。优先用 png 生成多尺寸，避免 Qt 读 png 压缩 ico 失败。"""
    global _cached
    if _cached is not None:
        return _cached
    path = app_icon_path()
    icon = QIcon()
    src = QPixmap()
    png = path.with_suffix(".png") if path.suffix.lower() != ".png" else path
    if png.is_file():
        src = QPixmap(str(png))
    if src.isNull() and path.is_file():
        src = QPixmap(str(path))
    if not src.isNull():
        for size in (16, 20, 24, 32, 40, 48, 64, 128, 256):
            icon.addPixmap(
                src.scaled(size, size, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            )
    elif path.is_file():
        icon = QIcon(str(path))
    _cached = icon
    return icon


def apply_window_icon(widget: QWidget) -> None:
    icon = app_icon()
    if not icon.isNull():
        widget.setWindowIcon(icon)
    _apply_native_hwnd_icon(widget)


def _ico_path() -> Optional[Path]:
    path = app_icon_path()
    if path.is_file() and path.suffix.lower() == ".ico":
        return path
    ico = path.with_suffix(".ico")
    return ico if ico.is_file() else None


def _win_hicons() -> Tuple[int, int]:
    """LoadImageW 读 ico，供 WM_SETICON 使用；句柄进程内复用。"""
    global _hicons
    if _hicons is not None:
        return _hicons
    _hicons = (0, 0)
    if sys.platform != "win32":
        return _hicons
    ico = _ico_path()
    if ico is None:
        return _hicons
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        LoadImageW = user32.LoadImageW
        LoadImageW.argtypes = [
            wintypes.HINSTANCE,
            wintypes.LPCWSTR,
            wintypes.UINT,
            ctypes.c_int,
            ctypes.c_int,
            wintypes.UINT,
        ]
        LoadImageW.restype = wintypes.HANDLE

        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x0010
        SM_CXICON, SM_CYICON = 11, 12
        SM_CXSMICON, SM_CYSMICON = 49, 50
        path = str(ico)
        h_big = LoadImageW(
            None,
            path,
            IMAGE_ICON,
            user32.GetSystemMetrics(SM_CXICON),
            user32.GetSystemMetrics(SM_CYICON),
            LR_LOADFROMFILE,
        )
        h_small = LoadImageW(
            None,
            path,
            IMAGE_ICON,
            user32.GetSystemMetrics(SM_CXSMICON),
            user32.GetSystemMetrics(SM_CYSMICON),
            LR_LOADFROMFILE,
        )
        _hicons = (int(h_big or 0), int(h_small or 0))
    except Exception:
        _hicons = (0, 0)
    return _hicons


def _apply_native_hwnd_icon(widget: QWidget) -> None:
    """Qt setWindowIcon 对任务栏不够稳，再用 WM_SETICON 钉死应用图标。"""
    if sys.platform != "win32":
        return
    if not widget.testAttribute(Qt.WA_WState_Created):
        return
    h_big, h_small = _win_hicons()
    if not h_big and not h_small:
        return
    try:
        import ctypes
        from ctypes import wintypes

        hwnd = int(widget.winId())
        if not hwnd:
            return
        user32 = ctypes.windll.user32
        SendMessageW = user32.SendMessageW
        SendMessageW.argtypes = [
            wintypes.HWND,
            wintypes.UINT,
            wintypes.WPARAM,
            wintypes.LPARAM,
        ]
        SendMessageW.restype = wintypes.LPARAM
        WM_SETICON, ICON_SMALL, ICON_BIG = 0x0080, 0, 1
        if h_small:
            SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_small)
        if h_big:
            SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_big)

        GCLP_HICON, GCLP_HICONSM = -14, -34
        if ctypes.sizeof(ctypes.c_void_p) == 8:
            set_class = user32.SetClassLongPtrW
            set_class.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
            set_class.restype = ctypes.c_void_p
        else:
            set_class = user32.SetClassLongW
            set_class.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.DWORD]
            set_class.restype = wintypes.DWORD
        if h_big:
            set_class(hwnd, GCLP_HICON, h_big)
        if h_small:
            set_class(hwnd, GCLP_HICONSM, h_small)
    except Exception:
        pass


def _draw_triangle(size: int, direction: str, color: str = "#0F172A") -> QPixmap:
    pm = QPixmap(size, size)
    pm.fill(Qt.transparent)
    painter = QPainter(pm)
    painter.setRenderHint(QPainter.Antialiasing, True)
    painter.setBrush(QColor(color))
    painter.setPen(Qt.NoPen)
    m = max(1, size // 8)
    if direction == "up":
        pts = [QPoint(size // 2, m), QPoint(size - m, size - m), QPoint(m, size - m)]
    else:  # down
        pts = [QPoint(m, m), QPoint(size - m, m), QPoint(size // 2, size - m)]
    painter.drawPolygon(QPolygon(pts))
    painter.end()
    return pm


def ensure_rail_arrow_icons() -> Dict[str, str]:
    """生成控制轨用黑色小三角，返回 stylesheet 可用的 url 路径。"""
    global _arrow_cache
    if _arrow_cache is not None:
        return _arrow_cache
    out_dir = data_dir() / "ui_cache"
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        "up": ("arrow_up_ink.png", "up", 8),
        "down": ("arrow_down_ink.png", "down", 8),
        "combo": ("arrow_combo_ink.png", "down", 9),
    }
    result: Dict[str, str] = {}
    for key, (name, direction, size) in mapping.items():
        path: Path = out_dir / name
        if not path.is_file():
            _draw_triangle(size, direction).save(str(path), "PNG")
        # Qt stylesheet 在 Windows 上用正斜杠更稳
        result[key] = path.resolve().as_posix()
    _arrow_cache = result
    return result
