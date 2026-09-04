#!/usr/bin/env python3
"""One-shot: move license API to :8080 and enable HTTPS via nginx+certbot (Alibaba/RHEL)."""

from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = os.environ.get("JINDOU_SSH_HOST", "").strip()
PASSWORD = os.environ.get("JINDOU_SSH_PASSWORD", "")
DOMAIN = os.environ.get("JINDOU_LICENSE_DOMAIN", "license.sugaiming.com")

SERVICE = """[Unit]
Description=Jindou license redeem API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/jindou-license
Environment=JINDOU_DB=/opt/jindou-license/data/cards.db
Environment=JINDOU_HOST=127.0.0.1
Environment=JINDOU_PORT=8080
ExecStart=/usr/bin/python3 /opt/jindou-license/app.py
Restart=always
RestartSec=2
User=root

[Install]
WantedBy=multi-user.target
"""

NGINX = f"""server {{
    listen 80;
    server_name {DOMAIN};
    location / {{
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""


def main() -> int:
    if not HOST:
        print("Set JINDOU_SSH_HOST", file=sys.stderr)
        return 1
    if not PASSWORD:
        print("Set JINDOU_SSH_PASSWORD", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.load_system_host_keys()
    if os.environ.get("JINDOU_SSH_TRUST_HOST", "").strip() in ("1", "true", "yes"):
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        HOST,
        username="root",
        password=PASSWORD,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )

    def run(cmd: str, check: bool = True, timeout: int = 1200) -> str:
        print("$", cmd if len(cmd) < 220 else cmd[:220] + "...")
        _stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=timeout)
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

    try:
        sftp = client.open_sftp()
        with sftp.file("/etc/systemd/system/jindou-license.service", "w") as f:
            f.write(SERVICE)
        sftp.close()

        run("systemctl daemon-reload && systemctl restart jindou-license")
        run(
            "python3 -c \"import urllib.request; "
            "print(urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=5).read().decode())\""
        )

        run("dnf install -y nginx certbot python3-certbot-nginx", check=False)
        # fallback packages if python3-certbot-nginx missing
        run("dnf install -y nginx certbot", check=False)

        sftp = client.open_sftp()
        with sftp.file("/etc/nginx/conf.d/jindou-license.conf", "w") as f:
            f.write(NGINX)
        sftp.close()

        run("rm -f /etc/nginx/conf.d/default.conf", check=False)
        run("nginx -t && systemctl enable nginx && systemctl restart nginx")

        # open firewall if present
        run("firewall-cmd --permanent --add-service=http --add-service=https 2>/dev/null; firewall-cmd --reload 2>/dev/null; true", check=False)

        out = run(
            f"certbot --nginx -d {DOMAIN} --non-interactive --agree-tos "
            "--register-unsafely-without-email --redirect",
            check=False,
        )
        print("--- certbot finished ---")
        print(out[-1500:] if out else "")

        time.sleep(2)
        run(
            "python3 -c \"import urllib.request,ssl; ctx=ssl.create_default_context(); "
            f"print(urllib.request.urlopen('https://{DOMAIN}/health', timeout=20, context=ctx).read().decode())\""
        )
        print(f"HTTPS OK: https://{DOMAIN}/redeem")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("HTTPS SETUP FAILED:", exc, file=sys.stderr)
        raise SystemExit(1)
