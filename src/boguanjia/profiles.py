"""多账号 Profile 注册表与目录（授权仍在 data_dir 根，登录态按 Profile 隔离）。"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from boguanjia.paths import data_dir

DEFAULT_PROFILE_ID = "default"
MAX_PROFILES = 20

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass
class ProfileInfo:
    id: str
    name: str
    created_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "ProfileInfo":
        return cls(
            id=str(data.get("id") or "").strip(),
            name=str(data.get("name") or "").strip() or "未命名账号",
            created_at=str(data.get("created_at") or "").strip(),
        )


@dataclass
class ProfileRegistry:
    profiles: List[ProfileInfo] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"profiles": [p.to_dict() for p in self.profiles]}

    @classmethod
    def from_dict(cls, data: Optional[dict]) -> "ProfileRegistry":
        if not data or not isinstance(data, dict):
            return cls()
        raw = data.get("profiles")
        items: List[ProfileInfo] = []
        if isinstance(raw, list):
            for row in raw:
                if not isinstance(row, dict):
                    continue
                info = ProfileInfo.from_dict(row)
                if info.id and _ID_RE.match(info.id):
                    items.append(info)
        return cls(profiles=items)


def profiles_registry_path() -> Path:
    return data_dir() / "profiles.json"


def profile_dir(profile_id: str) -> Path:
    pid = _normalize_id(profile_id)
    p = data_dir() / "profiles" / pid
    p.mkdir(parents=True, exist_ok=True)
    return p


def _normalize_id(profile_id: str) -> str:
    pid = (profile_id or "").strip()
    if not pid or not _ID_RE.match(pid):
        raise ValueError(f"非法 Profile ID：{profile_id!r}")
    return pid


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        import os

        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            import os

            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _read_json(path: Path) -> Optional[dict]:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _save_registry(reg: ProfileRegistry) -> None:
    _write_json(profiles_registry_path(), reg.to_dict())


def _load_registry_raw() -> ProfileRegistry:
    return ProfileRegistry.from_dict(_read_json(profiles_registry_path()))


def _move_if_exists(src: Path, dst: Path) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return
    shutil.move(str(src), str(dst))


def ensure_profiles_migrated() -> ProfileRegistry:
    """若无 profiles.json，将旧扁平 settings/web_profile 迁入 profiles/default。"""
    path = profiles_registry_path()
    if path.is_file():
        reg = _load_registry_raw()
        if reg.profiles:
            # 确保目录存在
            for p in reg.profiles:
                profile_dir(p.id)
            return reg

    root = data_dir()
    dest = profile_dir(DEFAULT_PROFILE_ID)
    _move_if_exists(root / "settings.json", dest / "settings.json")
    flat_web = root / "web_profile"
    if flat_web.is_dir() and not (dest / "web_profile").exists():
        shutil.move(str(flat_web), str(dest / "web_profile"))

    reg = ProfileRegistry(
        profiles=[
            ProfileInfo(
                id=DEFAULT_PROFILE_ID,
                name="本机主账号",
                created_at=_now_str(),
            )
        ]
    )
    _save_registry(reg)
    return reg


def list_profiles() -> List[ProfileInfo]:
    return list(ensure_profiles_migrated().profiles)


def get_profile(profile_id: str) -> Optional[ProfileInfo]:
    pid = _normalize_id(profile_id)
    for p in list_profiles():
        if p.id == pid:
            return p
    return None


def default_profile() -> ProfileInfo:
    items = list_profiles()
    for p in items:
        if p.id == DEFAULT_PROFILE_ID:
            return p
    return items[0] if items else ProfileInfo(
        id=DEFAULT_PROFILE_ID, name="本机主账号", created_at=_now_str()
    )


def is_pro_plan() -> bool:
    from boguanjia.auth import is_license_valid
    from boguanjia.storage import load_account

    return is_license_valid(load_account())


def can_add_profile(*, is_pro: Optional[bool] = None) -> Tuple[bool, str]:
    pro = is_pro_plan() if is_pro is None else bool(is_pro)
    if not pro:
        return False, "免费版仅支持 1 个账号，请激活卡密升级专业版"
    items = list_profiles()
    if len(items) >= MAX_PROFILES:
        return False, f"账号数量已达上限（{MAX_PROFILES}）"
    return True, ""


def add_profile(name: str = "", *, is_pro: Optional[bool] = None) -> ProfileInfo:
    ok, msg = can_add_profile(is_pro=is_pro)
    if not ok:
        raise PermissionError(msg)
    label = (name or "").strip() or f"账号{len(list_profiles()) + 1}"
    pid = uuid.uuid4().hex[:12]
    info = ProfileInfo(id=pid, name=label, created_at=_now_str())
    profile_dir(info.id)
    reg = ensure_profiles_migrated()
    reg.profiles.append(info)
    _save_registry(reg)
    return info


def rename_profile(profile_id: str, name: str) -> ProfileInfo:
    pid = _normalize_id(profile_id)
    label = (name or "").strip()
    if not label:
        raise ValueError("名称不能为空")
    reg = ensure_profiles_migrated()
    found: Optional[ProfileInfo] = None
    for p in reg.profiles:
        if p.id == pid:
            p.name = label
            found = p
            break
    if found is None:
        raise KeyError(f"账号不存在：{pid}")
    _save_registry(reg)
    return found


def delete_profile(profile_id: str) -> None:
    pid = _normalize_id(profile_id)
    reg = ensure_profiles_migrated()
    if len(reg.profiles) <= 1:
        raise PermissionError("至少保留一个账号")
    if not any(p.id == pid for p in reg.profiles):
        raise KeyError(f"账号不存在：{pid}")
    from boguanjia.profile_runtime import is_profile_running

    if is_profile_running(pid):
        raise PermissionError("账号运行中，请先关闭工作台窗口再删除")
    reg.profiles = [p for p in reg.profiles if p.id != pid]
    _save_registry(reg)
    target = data_dir() / "profiles" / pid
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
