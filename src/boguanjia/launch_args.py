"""CLI 参数解析（壳进程 / 工作台进程）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class LaunchArgs:
    profile_id: Optional[str] = None  # 有值则为工作台 worker

    @property
    def is_worker(self) -> bool:
        return bool(self.profile_id)


def parse_launch_args(argv: List[str]) -> LaunchArgs:
    """解析 --profile <id>；其余参数忽略（兼容 ASCII relaunch）。"""
    profile: Optional[str] = None
    i = 1
    while i < len(argv):
        arg = argv[i]
        if arg == "--profile" and i + 1 < len(argv):
            profile = str(argv[i + 1]).strip() or None
            i += 2
            continue
        if arg.startswith("--profile="):
            profile = arg.split("=", 1)[1].strip() or None
            i += 1
            continue
        i += 1
    return LaunchArgs(profile_id=profile)
