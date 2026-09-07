#!/usr/bin/env python3
"""Upload nginx conf that routes /bgj/ to boguanjia-license :8081."""

from __future__ import annotations

import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parent
CONF_LOCAL = ROOT / "jindou-license-with-bgj.conf"


def main() -> int:
    sys.path.insert(0, r"D:\Code\PythonProject\card-generator")
    from config import ALIYUN_REDEEM_BOGUANJIA as c

    if not CONF_LOCAL.is_file():
        raise SystemExit(f"missing {CONF_LOCAL}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        c["host"],
        username=c.get("user") or "root",
        password=c["password"],
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )

    def run(cmd: str, check: bool = True) -> str:
        print("$", cmd)
        _, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=120)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        text = (out or err).rstrip()
        if text:
            print(text)
        if check and code != 0:
            raise RuntimeError(f"failed ({code}): {cmd}")
        return out

    run(
        "cp -a /etc/nginx/conf.d/jindou-license.conf "
        "/etc/nginx/conf.d/jindou-license.conf.bak.manual"
    )
    sftp = client.open_sftp()
    sftp.put(str(CONF_LOCAL), "/etc/nginx/conf.d/jindou-license.conf")
    sftp.close()
    run("nginx -t")
    run("systemctl reload nginx")
    run(
        "python3 - <<'PY'\n"
        "import urllib.request, ssl\n"
        "ctx = ssl.create_default_context()\n"
        "for u in [\n"
        "  'https://license.sugaiming.com/health',\n"
        "  'https://license.sugaiming.com/bgj/health',\n"
        "]:\n"
        "    body = urllib.request.urlopen(u, timeout=15, context=ctx).read().decode()\n"
        "    print(u, '=>', body)\n"
        "PY"
    )
    client.close()
    print("OK: /bgj/ -> boguanjia-license:8081")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
