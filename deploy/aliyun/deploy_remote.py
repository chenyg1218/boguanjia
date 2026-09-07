#!/usr/bin/env python3
"""Deploy license API to Aliyun via SSH.

PRODUCT=jindou (default) → /opt/jindou-license · :8080 · license.sugaiming.com
PRODUCT=boguanjia        → /opt/boguanjia-license · :8081 · bgj-license.sugaiming.com
"""

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
PRODUCT = (os.environ.get("PRODUCT") or "jindou").strip().lower()

PROFILES = {
    "jindou": {
        "opt": "/opt/jindou-license",
        "unit": "jindou-license",
        "service_file": "jindou-license.service",
        "port": 8080,
        "public_health": "https://license.sugaiming.com/health",
        "public_redeem": "https://license.sugaiming.com/redeem",
    },
    "boguanjia": {
        "opt": "/opt/boguanjia-license",
        "unit": "boguanjia-license",
        "service_file": "boguanjia-license.service",
        "port": 8081,
        "public_health": "https://license.sugaiming.com/bgj/health",
        "public_redeem": "https://license.sugaiming.com/bgj/redeem",
    },
}


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


def make_archive(service_file: str) -> bytes:
    buf = io.BytesIO()
    names = ("app.py", "schema.sql", "import_cards.py", "license_crypto.py", service_file)
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in names:
            path = ROOT / name
            if path.is_file():
                tar.add(path, arcname=name)
    return buf.getvalue()


def main() -> int:
    if PRODUCT not in PROFILES:
        raise RuntimeError("PRODUCT must be jindou or boguanjia")
    profile = PROFILES[PRODUCT]
    opt = profile["opt"]
    unit = profile["unit"]
    service_file = profile["service_file"]
    port = profile["port"]
    tmp = f"/tmp/{unit}-deploy"

    client = connect()
    try:
        run(client, f"mkdir -p {opt}/data {tmp}")
        sftp = client.open_sftp()
        with sftp.file(f"{tmp}/bundle.tgz", "wb") as f:
            f.write(make_archive(service_file))
        secrets_local = ROOT / "secrets.env.local"
        if secrets_local.is_file():
            lines = []
            for line in secrets_local.read_text(encoding="utf-8").splitlines():
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                lines.append(s)
            body = ("\n".join(lines) + "\n").encode("utf-8")
            with sftp.file(f"{opt}/secrets.env", "wb") as f:
                f.write(body)
            print(f"Uploaded {opt}/secrets.env")
        else:
            print("WARN: secrets.env.local missing — skip secrets upload")
        sftp.close()

        run(client, f"chmod 600 {opt}/secrets.env 2>/dev/null || true", check=False)
        run(
            client,
            f"cd {tmp} && tar xzf bundle.tgz && "
            f"cp -f app.py schema.sql import_cards.py license_crypto.py {opt}/ && "
            f"cp -f {service_file} /etc/systemd/system/{unit}.service",
        )
        run(client, "python3 -m pip install -q 'PyNaCl>=1.5.0' || pip3 install -q 'PyNaCl>=1.5.0'", check=False)
        run(client, f"cd {opt} && python3 -c \"import app; app.init_db()\"")
        run(client, "systemctl daemon-reload")
        run(client, f"systemctl enable --now {unit}")
        run(client, f"systemctl restart {unit}")
        run(client, f"systemctl --no-pager --full status {unit} || true", check=False)
        run(
            client,
            "python3 - <<'PY'\n"
            "import urllib.request\n"
            f"print(urllib.request.urlopen('http://127.0.0.1:{port}/health', timeout=5).read().decode())\n"
            "PY",
        )
        run(
            client,
            "python3 - <<'PY'\n"
            "import urllib.request,ssl\n"
            "ctx=ssl.create_default_context()\n"
            f"u={profile['public_health']!r}\n"
            "try:\n"
            "    print(urllib.request.urlopen(u, timeout=15, context=ctx).read().decode())\n"
            "except Exception as e:\n"
            "    print('public health skip:', e)\n"
            "PY",
            check=False,
        )
        run(client, "systemctl is-active nginx >/dev/null && systemctl reload nginx || true", check=False)
        print("Deploy OK:", profile["public_redeem"], f"(origin {HOST}:{port}, db={opt}/data/cards.db)")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("DEPLOY FAILED:", e, file=sys.stderr)
        raise SystemExit(1)
