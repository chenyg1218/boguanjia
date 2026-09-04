"""应用入口。

V2：桌面端已迁移至 desktop/（Electron + oba 外置中控台）。
本入口仅提示迁移，保留 auth/deploy 等核销相关包供工具脚本使用。
"""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    desktop = root / "desktop"
    print("播管家 V2 桌面端已迁移到 desktop/（外置中控台，Win10+）。")
    print(f"请执行：")
    print(f"  cd {desktop}")
    print("  pnpm install")
    print("  pnpm dev")
    print("")
    print("旧版 Qt WebEngine 跟播注入已删除。核销服务仍见 deploy/aliyun/。")
    sys.exit(0)


if __name__ == "__main__":
    main()
