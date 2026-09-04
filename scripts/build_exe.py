"""PyInstaller 打包脚本 — 产出 dist/Boguanjia/（exe + WebEngine 资源）。

请使用 Python 3.8 x64 环境打包，以便产物可在 Windows 7 SP1+ 运行。
产物会附带 VC++ 2015–2022 x64 运行库安装包（Win7 需要）。

发行目录名：Boguanjia（英文路径启动更快）；exe 显示名为「播管家.exe」。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 发行目录保持英文：中文路径会拖慢启动（见用户教程）
DIST_NAME = "Boguanjia"
# exe 文件名可用中文
EXE_DISPLAY_NAME = "播管家.exe"
VC_REDIST_NAME = "vc_redist.x64.exe"
VC_REDIST_URL = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
VC_REDIST_CACHE = ROOT / "third_party" / "vc_redist" / VC_REDIST_NAME


def ensure_vc_redist() -> Path:
    """确保本地有 VC++ x64 运行库安装包（缓存到 third_party，避免重复下载）。"""
    if VC_REDIST_CACHE.is_file() and VC_REDIST_CACHE.stat().st_size > 1_000_000:
        print("已有 VC++ 运行库缓存:", VC_REDIST_CACHE)
        return VC_REDIST_CACHE

    VC_REDIST_CACHE.parent.mkdir(parents=True, exist_ok=True)
    tmp = VC_REDIST_CACHE.with_suffix(".download")
    print("正在下载 VC++ 2015–2022 x64 运行库…")
    print("  ", VC_REDIST_URL)
    try:
        urllib.request.urlretrieve(VC_REDIST_URL, tmp)
    except Exception as e:
        if tmp.exists():
            tmp.unlink()
        raise RuntimeError(
            f"下载 VC++ 运行库失败: {e}\n"
            f"请手动下载 {VC_REDIST_URL}\n"
            f"保存为: {VC_REDIST_CACHE}"
        ) from e

    size = tmp.stat().st_size
    if size < 1_000_000:
        tmp.unlink()
        raise RuntimeError(f"下载的 VC++ 运行库异常过小 ({size} bytes)，请检查网络后重试。")

    tmp.replace(VC_REDIST_CACHE)
    print(f"已缓存 VC++ 运行库 ({size // 1024 // 1024} MB):", VC_REDIST_CACHE)
    return VC_REDIST_CACHE


def bundle_vc_redist(out: Path) -> None:
    """把运行库安装包与一键安装脚本放入发行目录。"""
    src = ensure_vc_redist()
    dest = out / VC_REDIST_NAME
    shutil.copy2(src, dest)
    bat = out / "安装VC运行库.bat"
    bat.write_text(
        "@echo off\r\n"
        "chcp 65001 >nul\r\n"
        "cd /d \"%~dp0\"\r\n"
        "if not exist \"vc_redist.x64.exe\" (\r\n"
        "  echo 未找到 vc_redist.x64.exe，请联系商家重新获取完整安装包。\r\n"
        "  pause\r\n"
        "  exit /b 1\r\n"
        ")\r\n"
        "echo 即将安装 Microsoft Visual C++ 运行库（x64）。\r\n"
        "echo Win7 用户请先完成此步骤，再运行本软件。\r\n"
        "echo 安装过程可能需要管理员权限。\r\n"
        "echo.\r\n"
        "start /wait \"\" \"vc_redist.x64.exe\" /install /passive /norestart\r\n"
        "if errorlevel 1 (\r\n"
        "  echo 安装未成功完成。可双击 vc_redist.x64.exe 手动安装。\r\n"
        ") else (\r\n"
        "  echo 安装完成。若软件仍无法启动，请重启电脑后再试。\r\n"
        ")\r\n"
        "pause\r\n",
        encoding="utf-8",
    )
    print("已附带:", dest.name, "与", bat.name)


def main() -> int:
    if sys.version_info[:2] != (3, 8):
        print(
            f"[ERROR] 当前为 Python {sys.version_info.major}.{sys.version_info.minor}，"
            "Win7 兼容打包必须使用 Python 3.8 x64。\n"
            "请双击项目根目录 build.bat，或手动执行：\n"
            r'  D:\Software\miniconda3\envs\live_autocomm\python.exe scripts\build_exe.py'
        )
        return 1
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("请先: pip install 'pyinstaller>=5.13,<7'")
        return 1
    try:
        import PySide2  # noqa: F401
    except ImportError:
        print("当前环境未安装 PySide2。请先: pip install -r requirements.txt")
        return 1

    try:
        ensure_vc_redist()
    except RuntimeError as e:
        print(e)
        return 1

    dist = ROOT / "dist" / DIST_NAME
    work = ROOT / "build" / "pyinstaller"
    if dist.exists():
        shutil.rmtree(dist, ignore_errors=True)

    entry = ROOT / "src" / "boguanjia" / "__main__.py"
    assets_dir = ROOT / "assets"
    icon_ico = assets_dir / "icon.ico"
    icon_png = assets_dir / "icon.png"
    sep = ";" if sys.platform == "win32" else ":"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--windowed",
        "--noupx",
        "--name",
        DIST_NAME,
        "--paths",
        str(ROOT / "src"),
        "--distpath",
        str(ROOT / "dist"),
        "--workpath",
        str(work),
        "--specpath",
        str(work),
        "--collect-all",
        "PySide2",
        "--copy-metadata",
        "PySide2",
        # 核销 HTTPS：打包 certifi CA，避免 Windows 系统证书库 ASN1 异常
        "--collect-all",
        "certifi",
        "--copy-metadata",
        "certifi",
        "--collect-all",
        "nacl",
        "--copy-metadata",
        "PyNaCl",
        # PyNaCl 1.5+ 经 cffi 加载 libsodium；漏打 _cffi_backend 时验签会 ModuleNotFoundError
        "--hidden-import",
        "_cffi_backend",
        "--collect-all",
        "cffi",
    ]
    if icon_ico.is_file():
        cmd.extend(["--icon", str(icon_ico)])
    # 运行时窗口图标（打进 _internal/assets，并复制到 exe 旁 assets/）
    for asset in (icon_ico, icon_png):
        if asset.is_file():
            cmd.extend(["--add-data", f"{asset}{sep}assets"])
    # 内置授权与选择器（不放到 exe 旁 config）
    resources_dir = ROOT / "src" / "boguanjia" / "resources"
    if resources_dir.is_dir():
        cmd.extend(
            ["--add-data", f"{resources_dir}{sep}boguanjia/resources"]
        )
    cmd.append(str(entry))
    print("运行:", " ".join(cmd))
    rc = subprocess.call(cmd, cwd=str(ROOT))
    if rc != 0:
        return rc

    # 附带 config / VC++ 运行库（用户数据在 %LOCALAPPDATA%，不再附带空 data/）
    out = ROOT / "dist" / DIST_NAME
    if not out.is_dir():
        candidates = list((ROOT / "dist").glob("*"))
        print("输出目录:", candidates)
        out = ROOT / "dist" / DIST_NAME

    cfg_src = ROOT / "config"
    if out.is_dir() and cfg_src.is_dir():
        # PyInstaller 产出 Boguanjia.exe → 重命名为中文显示名（目录保持 ASCII）
        built_exe = out / f"{DIST_NAME}.exe"
        display_exe = out / EXE_DISPLAY_NAME
        if built_exe.is_file():
            if display_exe.exists():
                display_exe.unlink()
            built_exe.rename(display_exe)
            print("已重命名 exe:", display_exe.name)

        dest_cfg = out / "config"
        if dest_cfg.exists():
            shutil.rmtree(dest_cfg)
        dest_cfg.mkdir(parents=True, exist_ok=True)
        # 仅附带用户可调的默认设置；license/selectors 已内置进程序，不外置
        for name in ("default_settings.json",):
            src = cfg_src / name
            if src.is_file():
                shutil.copy2(src, dest_cfg / name)
        # 窗口图标：放到 exe 旁 assets/，勿放在主目录
        dest_assets = out / "assets"
        dest_assets.mkdir(exist_ok=True)
        for asset in (icon_ico, icon_png):
            if asset.is_file():
                shutil.copy2(asset, dest_assets / asset.name)
        try:
            bundle_vc_redist(out)
        except RuntimeError as e:
            print(e)
            return 1
        readme = out / "使用说明.txt"
        readme.write_text(
            "播管家 V1.0\n"
            "系统要求：Windows 7 SP1 / 8 / 10 / 11（x64）\n"
            "\n"
            "【Win7 用户必做】若软件打不开或提示缺少 VCRUNTIME140.dll：\n"
            "  先双击「安装VC运行库.bat」（或直接运行 vc_redist.x64.exe），装完再启动软件。\n"
            "  Win10/11 一般已自带，可跳过。\n"
            "\n"
            "1. 将本文件夹整份放到英文路径（如 D:\\Boguanjia\\），运行 播管家.exe\n"
            "   （英文路径比中文路径启动更快；exe 文件名不用改）\n"
            "2. 输入卡密激活（未到期可续充叠加）\n"
            "3. 扫码登录快手后点「提取直播信息」再开始运行\n"
            "4. 详细步骤见同目录《用户教程.md》\n",
            encoding="utf-8",
        )
        tutorial = ROOT / "docs" / "用户教程.md"
        if tutorial.is_file():
            shutil.copy2(tutorial, out / "用户教程.md")

        print("打包完成:", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
