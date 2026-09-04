"""设置与账号持久化（账号文件 Windows DPAPI 加密）。"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from boguanjia.models import AccountState, AppSettings
from boguanjia.paths import (
    account_encrypted_path,
    account_path,
    default_settings_path,
    settings_path,
    web_profile_dir,
)

_ACCOUNT_MAGIC = b"JDENC1\n"


def _read_json(path: Path) -> Optional[dict]:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_json(path: Path, data: Any) -> None:
    """原子写入，避免写一半损坏。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    harden_data_file(path)


def _write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    harden_data_file(path)


def harden_data_file(path: Path) -> None:
    """尽量限制当前用户读写（Windows ACL / Unix 0600）。"""
    try:
        if not path.exists():
            return
        if sys.platform == "win32":
            _harden_windows_path(path)
        else:
            os.chmod(path, 0o600)
    except OSError:
        pass


def harden_data_dir(path: Path) -> None:
    """限制目录访问（web_profile 等含 Cookie 的目录）。"""
    try:
        path.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            _harden_windows_path(path)
        else:
            os.chmod(path, 0o700)
    except OSError:
        pass


def _harden_windows_path(path: Path) -> None:
    """用 icacls 去掉继承并仅保留当前用户权限。"""
    import getpass
    import subprocess

    user = getpass.getuser()
    cmd = [
        "icacls",
        str(path),
        "/inheritance:r",
        "/grant:r",
        f"{user}:(OI)(CI)F" if path.is_dir() else f"{user}:F",
    ]
    subprocess.run(
        cmd,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def _dpapi_protect(raw: bytes) -> Optional[bytes]:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        blob_in = DATA_BLOB(len(raw), ctypes.create_string_buffer(raw, len(raw)))
        blob_out = DATA_BLOB()
        if not crypt32.CryptProtectData(
            ctypes.byref(blob_in),
            "JindouAccount",
            None,
            None,
            None,
            0,
            ctypes.byref(blob_out),
        ):
            return None
        try:
            return ctypes.string_at(blob_out.pbData, blob_out.cbData)
        finally:
            kernel32.LocalFree(blob_out.pbData)
    except Exception:
        return None


def _dpapi_unprotect(enc: bytes) -> Optional[bytes]:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        blob_in = DATA_BLOB(len(enc), ctypes.create_string_buffer(enc, len(enc)))
        blob_out = DATA_BLOB()
        if not crypt32.CryptUnprotectData(
            ctypes.byref(blob_in),
            None,
            None,
            None,
            None,
            0,
            ctypes.byref(blob_out),
        ):
            return None
        try:
            return ctypes.string_at(blob_out.pbData, blob_out.cbData)
        finally:
            kernel32.LocalFree(blob_out.pbData)
    except Exception:
        return None


def ensure_sensitive_dirs() -> None:
    """启动时加固账号文件与浏览器配置目录。"""
    harden_data_dir(web_profile_dir())
    for p in (account_path(), account_encrypted_path()):
        if p.is_file():
            harden_data_file(p)


def load_settings() -> AppSettings:
    data = _read_json(settings_path())
    if data is None:
        data = _read_json(default_settings_path()) or {}
    return AppSettings.from_dict(data)


def save_settings(settings: AppSettings) -> None:
    _write_json(settings_path(), settings.to_dict())


def load_account() -> AccountState:
    enc_path = account_encrypted_path()
    if enc_path.is_file():
        try:
            blob = enc_path.read_bytes()
            if blob.startswith(_ACCOUNT_MAGIC):
                plain = _dpapi_unprotect(blob[len(_ACCOUNT_MAGIC) :])
                if plain:
                    data = json.loads(plain.decode("utf-8"))
                    return AccountState.from_dict(data if isinstance(data, dict) else {})
        except Exception:
            pass
    return AccountState.from_dict(_read_json(account_path()))


def save_account(account: AccountState) -> None:
    data = account.to_dict()
    raw = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    protected = _dpapi_protect(raw)
    if protected is not None:
        _write_bytes_atomic(account_encrypted_path(), _ACCOUNT_MAGIC + protected)
        # 清除明文副本（若曾存在）
        plain = account_path()
        try:
            if plain.is_file():
                plain.unlink()
        except OSError:
            pass
        return
    _write_json(account_path(), data)


@contextmanager
def account_file_lock(timeout: float = 10.0) -> Iterator[None]:
    """跨进程互斥，避免多开同时写 account 丢叠加。"""
    path = account_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_name(path.name + ".lock")
    deadline = time.time() + timeout
    fd: Optional[int] = None
    while True:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.write(fd, str(os.getpid()).encode("ascii", errors="ignore"))
            break
        except FileExistsError:
            if time.time() >= deadline:
                raise TimeoutError("获取授权文件锁超时，请关闭其他播管家窗口后重试")
            try:
                age = time.time() - lock_path.stat().st_mtime
                if age > 60:
                    lock_path.unlink(missing_ok=True)  # type: ignore[call-arg]
            except TypeError:
                try:
                    if lock_path.is_file():
                        lock_path.unlink()
                except OSError:
                    pass
            except OSError:
                pass
            time.sleep(0.05)
    try:
        yield
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            lock_path.unlink()
        except OSError:
            pass
