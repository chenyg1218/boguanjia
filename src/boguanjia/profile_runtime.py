"""Profile 工作台进程锁与拉起。"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

from boguanjia.paths import data_dir, project_root
from boguanjia.profiles import get_profile, profile_dir


def _lock_path(profile_id: str) -> Path:
    return profile_dir(profile_id) / "runtime.pid"


def _hwnd_path(profile_id: str) -> Path:
    return profile_dir(profile_id) / "runtime.hwnd"


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            import ctypes

            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            handle = ctypes.windll.kernel32.OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION, False, pid
            )
            if not handle:
                return False
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def read_profile_pid(profile_id: str) -> Optional[int]:
    path = _lock_path(profile_id)
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip()
        pid = int(raw.splitlines()[0].strip())
        return pid
    except Exception:
        return None


def is_profile_running(profile_id: str) -> bool:
    pid = read_profile_pid(profile_id)
    if pid is None:
        return False
    if _pid_alive(pid):
        return True
    # 残留锁清理
    release_profile_lock(profile_id)
    return False


def acquire_profile_lock(profile_id: str) -> bool:
    """占用 Profile；若已被其他存活进程占用则返回 False。"""
    path = _lock_path(profile_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = read_profile_pid(profile_id)
    if existing is not None and existing != os.getpid() and _pid_alive(existing):
        return False
    path.write_text(str(os.getpid()), encoding="utf-8")
    return True


def write_profile_hwnd(profile_id: str, hwnd: int) -> None:
    if hwnd <= 0:
        return
    try:
        _hwnd_path(profile_id).write_text(str(int(hwnd)), encoding="utf-8")
    except OSError:
        pass


def release_profile_lock(profile_id: str) -> None:
    for p in (_lock_path(profile_id), _hwnd_path(profile_id)):
        try:
            if p.is_file():
                p.unlink()
        except OSError:
            pass


def activate_profile_window(profile_id: str) -> bool:
    """尝试前置已运行的工作台窗口（Windows）。"""
    if sys.platform != "win32":
        return is_profile_running(profile_id)
    hwnd = 0
    path = _hwnd_path(profile_id)
    if path.is_file():
        try:
            hwnd = int(path.read_text(encoding="utf-8").strip())
        except Exception:
            hwnd = 0
    if hwnd <= 0:
        return is_profile_running(profile_id)
    try:
        import ctypes

        user32 = ctypes.windll.user32
        if not user32.IsWindow(hwnd):
            return False
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        user32.SetForegroundWindow(hwnd)
        return True
    except Exception:
        return False


def launch_argv_prefix() -> list:
    """返回启动本程序的 argv 前缀（frozen / 开发态）。"""
    if getattr(sys, "frozen", False):
        original = (
            os.environ.get("BOGUANJIA_ORIGINAL_EXE")
            or os.environ.get("JINDOU_ORIGINAL_EXE")
            or ""
        ).strip()
        exe = original if original and os.path.isfile(original) else sys.executable
        return [exe]
    # 开发：python -m boguanjia
    return [sys.executable, "-m", "boguanjia"]


def spawn_profile_worker(profile_id: str) -> None:
    """打开（或前置）指定 Profile 的工作台进程。"""
    info = get_profile(profile_id)
    if info is None:
        raise KeyError(f"账号不存在：{profile_id}")
    if is_profile_running(profile_id):
        if activate_profile_window(profile_id):
            return
        # 锁在但窗口激活失败：仍视为已运行，避免双开抢 profile
        return

    args = [*launch_argv_prefix(), "--profile", profile_id]
    env = os.environ.copy()
    # 子进程若再经 ASCII relaunch，保留 argv
    kwargs = {
        "args": args,
        "env": env,
        "cwd": str(project_root()) if not getattr(sys, "frozen", False) else None,
        "close_fds": True,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen(**kwargs)
    # 短暂等待锁出现，便于 UI 刷新
    deadline = time.time() + 3.0
    while time.time() < deadline:
        if is_profile_running(profile_id):
            return
        time.sleep(0.1)
