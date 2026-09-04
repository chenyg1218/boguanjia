"""打包入口。

frozen + 安装目录含中文时，Qt5/WebEngine 可能在加载 Qt5Core 时崩溃。
因此在 import PySide2 之前，若「目录」非 ASCII，则经短路径或英文目录联接重新拉起。
注意：exe 文件名可以是中文；只要所在目录是英文即可（已验证）。
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys


def _is_ascii(path: str) -> bool:
    try:
        path.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def _message_box(text: str, *, error: bool = True) -> None:
    try:
        import ctypes

        flag = 0x10 if error else 0x40  # MB_ICONERROR / MB_ICONINFORMATION
        ctypes.windll.user32.MessageBoxW(0, text, "播管家", flag)
    except Exception:
        pass


def _short_path(path: str) -> str:
    """Windows 8.3 短路径；未启用短名时可能仍返回含非 ASCII 的原路径。"""
    try:
        import ctypes

        GetShortPathNameW = ctypes.windll.kernel32.GetShortPathNameW
        need = GetShortPathNameW(path, None, 0)
        if need <= 0:
            buf = ctypes.create_unicode_buffer(32768)
            n = GetShortPathNameW(path, buf, len(buf))
            return buf.value if n else ""
        buf = ctypes.create_unicode_buffer(need)
        n = GetShortPathNameW(path, buf, need)
        return buf.value if n else ""
    except Exception:
        return ""


def _relaunch(exe: str) -> None:
    """用 ASCII 目录路径再启一份进程，当前进程硬退出（frozen 下 SystemExit 不可靠）。"""
    os.environ["BOGUANJIA_ASCII_LAUNCH"] = "1"
    os.environ["JINDOU_ASCII_LAUNCH"] = "1"  # 兼容旧启动链路
    if "BOGUANJIA_ORIGINAL_EXE" not in os.environ and "JINDOU_ORIGINAL_EXE" not in os.environ:
        os.environ["BOGUANJIA_ORIGINAL_EXE"] = os.path.abspath(sys.executable)
        os.environ["JINDOU_ORIGINAL_EXE"] = os.environ["BOGUANJIA_ORIGINAL_EXE"]

    args = [exe, *sys.argv[1:]]
    cwd = os.path.dirname(exe) or None
    subprocess.Popen(
        args,
        cwd=cwd,
        close_fds=True,
        env=os.environ.copy(),
    )
    os._exit(0)


def _junction_launch_exe(app_dir: str, exe_name: str) -> str:
    """在纯英文目录下建 junction 指向安装目录，返回联接内的 exe 路径。"""
    prog = os.environ.get("PROGRAMDATA") or r"C:\ProgramData"
    if not _is_ascii(prog):
        prog = r"C:\ProgramData"
    if not _is_ascii(prog):
        return ""

    digest = hashlib.sha1(os.path.normcase(app_dir).encode("utf-8")).hexdigest()[:16]
    link_root = os.path.join(prog, "Boguanjia", "run")
    link_dir = os.path.join(link_root, digest)
    link_exe = os.path.join(link_dir, exe_name)

    def _usable(path_exe: str, path_dir: str) -> bool:
        # 只需目录 ASCII；exe 文件名允许中文
        return os.path.isfile(path_exe) and _is_ascii(path_dir)

    if _usable(link_exe, link_dir):
        return link_exe

    os.makedirs(link_root, exist_ok=True)

    if os.path.isdir(link_dir):
        try:
            os.rmdir(link_dir)  # 仅拆除联接，不删目标内容
        except OSError:
            link_dir = os.path.join(link_root, digest + "_j")
            link_exe = os.path.join(link_dir, exe_name)
            if _usable(link_exe, link_dir):
                return link_exe
            if os.path.isdir(link_dir):
                try:
                    os.rmdir(link_dir)
                except OSError:
                    return ""

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        completed = subprocess.run(
            ["cmd", "/c", "mklink", "/J", link_dir, app_dir],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creationflags,
        )
    except Exception:
        return ""

    if completed.returncode != 0 or not _usable(link_exe, link_dir):
        return ""
    return link_exe


def _ensure_ascii_compatible_launch() -> None:
    """安装「目录」含非 ASCII 时，先切到短路径 / 英文联接再加载 Qt。"""
    if not getattr(sys, "frozen", False):
        return
    if sys.platform != "win32":
        return
    if os.environ.get("BOGUANJIA_ASCII_LAUNCH") == "1" or os.environ.get("JINDOU_ASCII_LAUNCH") == "1":
        return

    exe = os.path.abspath(sys.executable)
    app_dir = os.path.dirname(exe)
    # 目录已是英文：即使 exe 文件名含中文也安全
    if _is_ascii(app_dir):
        return

    short_exe = _short_path(exe)
    short_dir = os.path.dirname(short_exe) if short_exe else ""
    if short_exe and short_dir and _is_ascii(short_dir) and os.path.isfile(short_exe):
        _relaunch(short_exe)

    link_exe = _junction_launch_exe(app_dir, os.path.basename(exe))
    if link_exe:
        _relaunch(link_exe)

    _message_box(
        "当前安装目录无法启动，请把整个文件夹复制到其他路径后再试，例如：\n"
        "  D:\\Boguanjia\\\n\n"
        f"当前路径：\n{app_dir}"
    )
    os._exit(1)


_ensure_ascii_compatible_launch()


def _set_app_user_model_id() -> None:
    """在 import Qt 之前绑定任务栏 AppID，避免显示 python.exe 图标。"""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        from boguanjia.paths import APP_USER_MODEL_ID

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
    except Exception:
        pass


_set_app_user_model_id()

from boguanjia.app import main

if __name__ == "__main__":
    main()
