"""路径与常量。"""

from __future__ import annotations

import hashlib
import os
import shutil
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import quote

# Windows 任务栏分组 ID；必须在创建窗口前设置，否则会显示 python.exe / 网页 favicon。
APP_USER_MODEL_ID = "Boguanjia.Kuaishou"

# 快手小店跟播助手 https://zs.kwaixiaodian.com/page/helper
ASSISTANT_URL = "https://zs.kwaixiaodian.com/page/helper"
LOGIN_URL = (
    "https://login.kwaixiaodian.com/?biz=zone"
    "&redirect_url="
    + quote(ASSISTANT_URL, safe="")
)


def is_login_url(url: str) -> bool:
    u = (url or "").lower()
    return "login.kwaixiaodian" in u or ("passport" in u and "login" in u)


def is_assistant_url(url: str) -> bool:
    u = (url or "").lower()
    if is_login_url(u):
        return False
    if "zs.kwaixiaodian.com" in u and "helper" in u:
        return True
    # 旧跟播地址兼容
    if "/zone/live" in u or "live/assistant" in u:
        return True
    return False


def is_seller_home_url(url: str) -> bool:
    """卖家后台首页（登录后落地），需回弹到跟播助手。

    zs.kwaixiaodian.com 下的直播控制台子页（设置/列表/回放等）不算首页，允许停留。
    """
    u = (url or "").lower().split("?")[0].rstrip("/")
    if is_login_url(u) or is_assistant_url(u):
        return False
    if "zs.kwaixiaodian.com" in u:
        return False
    if u.endswith("s.kwaixiaodian.com") or u.endswith("s.kwaixiaodian.com/zone"):
        return True
    if "/zone/home" in u or u.endswith("/zone"):
        return True
    return "s.kwaixiaodian.com" in u and "/zone/live" not in u


def project_root() -> Path:
    if getattr(sys, "frozen", False):
        # 经短路径/联接拉起时，优先用用户双击的真实安装路径（数据隔离更稳）
        original = (
            os.environ.get("BOGUANJIA_ORIGINAL_EXE")
            or os.environ.get("JINDOU_ORIGINAL_EXE")
            or ""
        ).strip()
        if original:
            try:
                p = Path(original)
                if p.is_file():
                    return p.resolve().parent
            except OSError:
                pass
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def _legacy_data_dir() -> Path:
    return project_root() / "data"


def _appdata_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    root = Path(base) / "Boguanjia"
    _migrate_appdata_brand_once(root)
    return root


def _migrate_appdata_brand_once(new_root: Path) -> None:
    """金豆助手旧目录 JindouAssistant → Boguanjia（仅一次）。"""
    if sys.platform != "win32":
        return
    old_root = new_root.parent / "JindouAssistant"
    marker = new_root / ".migrated_from_jindou"
    if marker.is_file() or not old_root.is_dir():
        return
    try:
        new_root.mkdir(parents=True, exist_ok=True)
        if marker.is_file():
            return
        # 整树复制实例数据；已存在的文件不覆盖
        for src in old_root.rglob("*"):
            rel = src.relative_to(old_root)
            dst = new_root / rel
            if src.is_dir():
                dst.mkdir(parents=True, exist_ok=True)
            elif src.is_file() and not dst.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
        marker.write_text("1", encoding="utf-8")
    except OSError:
        pass


def _install_instance_id() -> str:
    """按安装目录区分实例：整包复制到另一路径即可多开隔离。"""
    root = str(project_root().resolve()).casefold()
    return hashlib.sha1(root.encode("utf-8")).hexdigest()[:16]


def data_dir() -> Path:
    """敏感数据目录：打包后在 %LOCALAPPDATA%/Boguanjia/instances/<安装路径摘要>/。

    登录态不跟安装包拷走；不同安装目录互不影响，支持「复制整包」多开。
    """
    if sys.platform == "win32" and getattr(sys, "frozen", False):
        p = _appdata_root() / "instances" / _install_instance_id()
    else:
        p = _legacy_data_dir()
    p.mkdir(parents=True, exist_ok=True)
    _migrate_legacy_data_once(p)
    _migrate_flat_appdata_once(p)
    return p


def _copy_data_files(src_dir: Path, dst_dir: Path) -> None:
    for name in ("account.json", "account.dat", "settings.json"):
        src = src_dir / name
        dst = dst_dir / name
        if src.is_file() and not dst.exists():
            shutil.copy2(src, dst)
    src_web = src_dir / "web_profile"
    dst_web = dst_dir / "web_profile"
    if src_web.is_dir() and not dst_web.exists():
        shutil.copytree(src_web, dst_web)


def _migrate_legacy_data_once(new_dir: Path) -> None:
    """首次启动：把 exe 旁 data/ 里的账号与浏览器配置迁到 LocalAppData。"""
    if not (sys.platform == "win32" and getattr(sys, "frozen", False)):
        return
    legacy = _legacy_data_dir()
    if not legacy.is_dir() or legacy.resolve() == new_dir.resolve():
        return
    marker = new_dir / ".migrated_from_portable"
    if marker.is_file():
        return
    try:
        _copy_data_files(legacy, new_dir)
        marker.write_text("1", encoding="utf-8")
    except OSError:
        pass


def _migrate_flat_appdata_once(instance_dir: Path) -> None:
    """旧版扁平目录 %LOCALAPPDATA%/Boguanjia/* → 当前安装对应的 instances 子目录。

    仅迁移一次，归属于先启动的那个安装目录，避免多开副本抢同一套登录态。
    """
    if not (sys.platform == "win32" and getattr(sys, "frozen", False)):
        return
    root = _appdata_root()
    claim = root / ".flat_data_claimed_by"
    if claim.is_file():
        return
    flat_names = ("account.json", "account.dat", "settings.json")
    has_flat = any((root / n).is_file() for n in flat_names) or (root / "web_profile").is_dir()
    if not has_flat:
        return
    try:
        _copy_data_files(root, instance_dir)
        claim.write_text(_install_instance_id(), encoding="utf-8")
    except OSError:
        pass


def config_dir() -> Path:
    return project_root() / "config"


# 当前工作台 Profile（授权文件仍在 data_dir 根；设置/浏览器目录按 Profile 隔离）
_current_profile_id: Optional[str] = None


def set_current_profile(profile_id: Optional[str]) -> None:
    global _current_profile_id
    pid = (profile_id or "").strip() or None
    _current_profile_id = pid


def current_profile_id() -> Optional[str]:
    return _current_profile_id


def profile_data_dir(profile_id: Optional[str] = None) -> Path:
    """单个快手登录态目录：<data_dir>/profiles/<id>/。"""
    pid = (profile_id or _current_profile_id or "default").strip() or "default"
    p = data_dir() / "profiles" / pid
    p.mkdir(parents=True, exist_ok=True)
    return p


def settings_path() -> Path:
    return profile_data_dir() / "settings.json"


def account_path() -> Path:
    return data_dir() / "account.json"


def account_encrypted_path() -> Path:
    return data_dir() / "account.dat"


def web_profile_dir() -> Path:
    p = profile_data_dir() / "web_profile"
    p.mkdir(parents=True, exist_ok=True)
    return p


def selectors_path() -> Path:
    return config_dir() / "selectors.json"


def default_settings_path() -> Path:
    return config_dir() / "default_settings.json"


def license_config_path() -> Path:
    return config_dir() / "license.json"


def app_icon_path() -> Path:
    """窗口 / 任务栏图标：优先 assets/icon.ico，其次同目录 png。

    打包后 PyInstaller 把 --add-data 资源放到 _MEIPASS（onedir 即 _internal），
    同时 build 也会把图标复制到 exe 旁的 assets/；两处都查。
    """
    root = project_root()
    assets = root / "assets"
    candidates = [assets / "icon.ico", assets / "icon.png"]
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            mp = Path(meipass)
            candidates.extend(
                [
                    mp / "assets" / "icon.ico",
                    mp / "assets" / "icon.png",
                    mp / "icon.ico",
                    mp / "icon.png",
                ]
            )
    for p in candidates:
        if p.is_file():
            return p
    return assets / "icon.ico"
