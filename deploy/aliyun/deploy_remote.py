#!/usr/bin/env python3
"""Deploy jindou-license to Aliyun lightweight server via SSH."""

from __future__ import annotations

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("JINDOU_SSH_HOST", "").strip()
USER = os.environ.get("JINDOU_SSH_USER", "root").strip() or "root"
PASSWORD = os.environ.get("JINDOU_SSH_PASSWORD", "")


def _ssh_policy():
    """默认拒绝未知主机密钥；显式信任时才 AutoAdd。"""
    if os.environ.get("JINDOU_SSH_TRUST_HOST", "").strip() in ("1", "true", "yes"):
        return paramiko.AutoAddPolicy()
    return paramiko.RejectPolicy()


def connect(retries: int = 8) -> paramiko.SSHClient:
    if not HOST:
        raise RuntimeError("Set env JINDOU_SSH_HOST before deploy")
    if not PASSWORD:
        raise RuntimeError("Set env JINDOU_SSH_PASSWORD before deploy")
    last = None
    for i in range(retries):
        client = paramiko.SSHClient()
        client.load_system_host_keys()
        client.set_missing_host_key_policy(_ssh_policy())
        try:
            client.connect(
                HOST,
                username=USER,
                password=PASSWORD,
                timeout=20,
                allow_agent=False,
                look_for_keys=False,
            )
            return client
        except Exception as e:
            last = e
            print(f"SSH connect retry {i + 1}/{retries}: {e}")
            time.sleep(3)
    raise RuntimeError(f"SSH failed: {last}")


def run(client: paramiko.SSHClient, cmd: str, check: bool = True) -> str:
    print(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    if check and code != 0:
        raise RuntimeError(f"command failed ({code}): {cmd}")
    return out


def make_archive() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in ("app.py", "schema.sql", "jindou-license.service", "import_cards.py", "license_crypto.py"):
            path = ROOT / name
            if path.is_file():
                tar.add(path, arcname=name)
    return buf.getvalue()


def main() -> int:
    client = connect()
    try:
        run(client, "mkdir -p /opt/jindou-license/data /tmp/jindou-deploy")
        sftp = client.open_sftp()
        with sftp.file("/tmp/jindou-deploy/bundle.tgz", "wb") as f:
            f.write(make_archive())
        secrets_local = ROOT / "secrets.env.local"
        if secrets_local.is_file():
            # 只含 KEY=VALUE，去掉注释行后写入服务器
            lines = []
            for line in secrets_local.read_text(encoding="utf-8").splitlines():
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                lines.append(s)
            body = ("\n".join(lines) + "\n").encode("utf-8")
            with sftp.file("/opt/jindou-license/secrets.env", "wb") as f:
                f.write(body)
            print("Uploaded /opt/jindou-license/secrets.env")
        else:
            print("WARN: secrets.env.local missing — skip secrets upload")
        sftp.close()

        run(client, "chmod 600 /opt/jindou-license/secrets.env 2>/dev/null || true", check=False)
        run(
            client,
            "cd /tmp/jindou-deploy && tar xzf bundle.tgz && "
            "cp -f app.py schema.sql import_cards.py license_crypto.py /opt/jindou-license/ && "
            "cp -f jindou-license.service /etc/systemd/system/jindou-license.service",
        )
        run(client, "python3 -m pip install -q 'PyNaCl>=1.5.0' || pip3 install -q 'PyNaCl>=1.5.0'", check=False)
        run(client, "cd /opt/jindou-license && python3 -c \"import app; app.init_db()\"")
        run(client, "systemctl daemon-reload")
        run(client, "systemctl enable --now jindou-license")
        run(client, "systemctl restart jindou-license")
        # HTTPS 反代时不要停 nginx；仅确保本机 8080 健康
        run(client, "systemctl --no-pager --full status jindou-license || true", check=False)
        run(
            client,
            "python3 - <<'PY'\n"
            "import urllib.request\n"
            "print(urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=5).read().decode())\n"
            "PY",
        )
        # 公网 HTTPS 冒烟（应仍可 health；signed API 需客户端）
        run(
            client,
            "python3 - <<'PY'\n"
            "import urllib.request,ssl\n"
            "ctx=ssl.create_default_context()\n"
            "u='https://license.sugaiming.com/health'\n"
            "print(urllib.request.urlopen(u, timeout=15, context=ctx).read().decode())\n"
            "PY",
            check=False,
        )
        run(client, "systemctl is-active nginx >/dev/null && systemctl reload nginx || true", check=False)
        print("Deploy OK:", "https://license.sugaiming.com/redeem", f"(origin {HOST}:8080)")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("DEPLOY FAILED:", e, file=sys.stderr)
        raise SystemExit(1)
