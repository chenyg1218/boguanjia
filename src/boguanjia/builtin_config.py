"""内置配置资源（打包进程序；正式包不向外暴露 license/selectors）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict


def _resources_dir() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            bundled = Path(meipass) / "boguanjia" / "resources"
            if bundled.is_dir():
                return bundled
        # onedir 兜底：exe 旁 _internal
        exe_dir = Path(sys.executable).resolve().parent
        alt = exe_dir / "_internal" / "boguanjia" / "resources"
        if alt.is_dir():
            return alt
    return Path(__file__).resolve().parent / "resources"


def load_json_resource(name: str) -> Dict[str, Any]:
    path = _resources_dir() / name
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def builtin_license_config() -> Dict[str, Any]:
    data = load_json_resource("license.json")
    if data:
        return data
    return {
        "redeem_url": "https://license.sugaiming.com/redeem",
        "announcement": "购买卡密后在此激活；没到期再充，剩余天数会自动加上。\n卡密购买：https://www.zaofaka.com/links/1CD589E2",
        "timeout_seconds": 15,
        "offline_grace_days": 2,
    }


def builtin_selectors() -> Dict[str, Any]:
    return load_json_resource("selectors.json")


def load_selectors() -> Dict[str, Any]:
    """正式包只读内置选择器；开发态可读项目 config/selectors.json 覆盖。"""
    if getattr(sys, "frozen", False):
        return builtin_selectors()

    from boguanjia.paths import selectors_path

    path = selectors_path()
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data:
                return data
        except Exception:
            pass
    return builtin_selectors()
