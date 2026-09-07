#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jindou license API: POST /redeem, POST /validate; responses include server_time."""

import json
import os
import re
import sqlite3
import threading
import time
from datetime import datetime, timedelta

try:
    from http.server import ThreadingHTTPServer
except ImportError:
    from http.server import HTTPServer
    from socketserver import ThreadingMixIn

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

DB_PATH = os.environ.get("JINDOU_DB", "/opt/jindou-license/data/cards.db")
HOST = os.environ.get("JINDOU_HOST", "0.0.0.0")
PORT = int(os.environ.get("JINDOU_PORT", "80"))
RATE_WINDOW_S = 60.0
RATE_MAX = 30
MAX_BODY_BYTES = 65536
SIGNING_SEED = os.environ.get("JINDOU_SIGNING_SEED", "").strip()
API_KEY = os.environ.get("JINDOU_API_KEY", "").strip()
try:
    SESSION_GRACE_DAYS = max(1, min(30, int(os.environ.get("JINDOU_SESSION_GRACE_DAYS", "2"))))
except ValueError:
    SESSION_GRACE_DAYS = 2
_MACHINE_ID_RE = re.compile(r"^[a-fA-F0-9]{16,64}$")
_TIME_FMT = "%Y-%m-%d %H:%M:%S"

_rate_lock = threading.Lock()
_rate_buckets = {}
_db_lock = threading.Lock()


def _normalize_plan(plan):
    raw = (plan or "").strip().lower()
    if raw in ("pro", "professional"):
        return "pro"
    if raw in ("flagship", "ultimate", "unlimited"):
        return "flagship"
    return "flagship"


def _plan_rank(plan):
    return 2 if _normalize_plan(plan) == "flagship" else 1


def _max_accounts(plan):
    """专业版 3；旗舰版 -1（无上限）。"""
    return 3 if _normalize_plan(plan) == "pro" else -1


def _issue_license_token(machine_id, expires_at_utc, plan="flagship"):
    if not SIGNING_SEED or not machine_id or not expires_at_utc:
        return ""
    try:
        from license_crypto import build_signed_token

        return build_signed_token(
            machine_id,
            expires_at_utc,
            _now_iso(),
            SESSION_GRACE_DAYS,
            SIGNING_SEED,
            plan=_normalize_plan(plan),
        )
    except Exception as exc:
        print("license token issue failed:", exc)
        return ""


def _attach_token(data, machine_id, plan="flagship"):
    if not isinstance(data, dict):
        return data
    mid = _normalize_machine_id(machine_id)
    exp = str(data.get("expires_at") or "")
    plan_n = _normalize_plan(plan or data.get("plan"))
    data["plan"] = plan_n
    data["max_accounts"] = _max_accounts(plan_n)
    if data.get("ok") and mid and exp and not data.get("revoked"):
        tok = _issue_license_token(mid, exp, plan_n)
        if tok:
            data["license_token"] = tok
    return data


def _verify_request_sig(path, payload):
    """若配置了 JINDOU_API_KEY，则强制校验客户端签名。"""
    if not API_KEY:
        return True, ""
    try:
        from license_crypto import check_request_signature
    except Exception as exc:
        return False, "服务端签名模块不可用: %s" % exc

    mid = str(payload.get("machine_id") or "")
    ts = str(payload.get("ts") or "")
    sig = str(payload.get("sig") or "")
    body = json.dumps(
        {k: v for k, v in payload.items() if k != "sig"},
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return check_request_signature(
        path=path,
        machine_id=mid,
        ts=ts,
        body=body,
        signature=sig,
        api_key_hex=API_KEY,
    )


def _now_utc():
    return datetime.utcnow()


def _now_iso():
    return _now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")


def _fmt_expires_utc(dt):
    """UTC ISO，供客户端换算本地展示。"""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_expires(value):
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            return datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ")
        if "T" in raw:
            return datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S")
        return datetime.strptime(raw[:19], _TIME_FMT)
    except ValueError:
        return None


def _ensure_db_dir():
    parent = os.path.dirname(DB_PATH)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)


def _connect():
    _ensure_db_dir()
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


def _migrate(conn):
    cols = {row[1] for row in conn.execute("PRAGMA table_info(cards)").fetchall()}
    if cols and "redeemed_by" not in cols:
        conn.execute("ALTER TABLE cards ADD COLUMN redeemed_by TEXT")
    if cols and "plan" not in cols:
        # 历史卡密默认旗舰（原先付费即多账号无上限）
        conn.execute(
            "ALTER TABLE cards ADD COLUMN plan TEXT NOT NULL DEFAULT 'flagship'"
        )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS machines ("
        "machine_id TEXT PRIMARY KEY NOT NULL,"
        "expires_at TEXT NOT NULL,"
        "updated_at TEXT NOT NULL,"
        "revoked INTEGER NOT NULL DEFAULT 0,"
        "plan TEXT NOT NULL DEFAULT 'flagship')"
    )
    mcols = {row[1] for row in conn.execute("PRAGMA table_info(machines)").fetchall()}
    if mcols and "plan" not in mcols:
        conn.execute(
            "ALTER TABLE machines ADD COLUMN plan TEXT NOT NULL DEFAULT 'flagship'"
        )


def init_db():
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    if os.path.isfile(schema_path):
        with open(schema_path, "r", encoding="utf-8") as f:
            sql = f.read()
    else:
        sql = ""
    with _db_lock:
        conn = _connect()
        try:
            if sql:
                conn.executescript(sql)
            _migrate(conn)
            conn.commit()
        finally:
            conn.close()


def allow_request(ip):
    now = time.time()
    with _rate_lock:
        arr = [t for t in _rate_buckets.get(ip, []) if now - t < RATE_WINDOW_S]
        if len(arr) >= RATE_MAX:
            _rate_buckets[ip] = arr
            return False
        arr.append(now)
        _rate_buckets[ip] = arr
        return True


def _normalize_machine_id(machine_id):
    mid = (machine_id or "").strip()
    if not mid or not _MACHINE_ID_RE.match(mid):
        return ""
    return mid.lower()


def _payload_base(**extra):
    data = {"server_time": _now_iso()}
    data.update(extra)
    return data


def _get_machine(conn, mid):
    return conn.execute(
        "SELECT machine_id, expires_at, updated_at, revoked, plan FROM machines WHERE machine_id = ?",
        (mid,),
    ).fetchone()


def _active_plan(conn, mid):
    """未过期且未吊销时返回当前档位，否则 None（可重新选档）。"""
    row = _get_machine(conn, mid)
    if row is None or int(row["revoked"] or 0) != 0:
        return None
    exp_dt = _parse_expires(row["expires_at"])
    if exp_dt is None or exp_dt < _now_utc():
        return None
    try:
        return _normalize_plan(row["plan"])
    except (KeyError, IndexError):
        return "flagship"


def _redeem_plan_decision(current_plan, card_plan):
    """
    同档续费、高档升级；低档卡在高档未到期时拒绝（调用方须尚未烧卡）。
    返回 (ok, error, result_plan)。
    """
    card_n = _normalize_plan(card_plan)
    if not current_plan:
        return True, "", card_n
    cur_n = _normalize_plan(current_plan)
    if card_n == cur_n:
        return True, "", card_n
    if _plan_rank(card_n) > _plan_rank(cur_n):
        return True, "", card_n
    cur_name = "旗舰版" if cur_n == "flagship" else "专业版"
    card_name = "旗舰版" if card_n == "flagship" else "专业版"
    return (
        False,
        "当前为%s有效期内，请使用同档或更高档卡密续费/升级；"
        "%s卡密需等当前档到期后再激活（卡密未核销）" % (cur_name, card_name),
        cur_n,
    )


def _stack_machine_expires(conn, mid, days, plan="flagship"):
    """服务端叠加天数，并写入已裁定的档位。不改动已有 revoked。"""
    now = _now_utc()
    row = _get_machine(conn, mid)
    base = now
    if row is not None and int(row["revoked"] or 0) == 0:
        cur = _parse_expires(row["expires_at"])
        if cur is not None and cur > now:
            base = cur
    new_plan = _normalize_plan(plan)
    new_exp = base + timedelta(days=int(days))
    exp_s = _fmt_expires_utc(new_exp)
    updated = _now_iso()
    conn.execute(
        "INSERT INTO machines (machine_id, expires_at, updated_at, revoked, plan) "
        "VALUES (?, ?, ?, 0, ?) "
        "ON CONFLICT(machine_id) DO UPDATE SET expires_at=excluded.expires_at, "
        "updated_at=excluded.updated_at, plan=excluded.plan",
        (mid, exp_s, updated, new_plan),
    )
    return exp_s, new_plan


def _machine_revoked(conn, mid):
    row = _get_machine(conn, mid)
    return row is not None and int(row["revoked"] or 0) != 0


def redeem(card, machine_id=""):
    """
    首次核销：unused → used，绑定 machine_id，并在 machines 表叠加到期与档位。
    规则：同档续时长；更高档可升级并叠加天数；更低档在高档未到期时拒绝且不烧卡。
    同机重试：replay，返回已有 days/used_at/expires_at/plan，不再叠加。
    已吊销机器：拒绝核销（不烧卡），也无法靠续充解除吊销。
    """
    card = (card or "").strip().upper()
    if not card:
        return 400, _payload_base(ok=False, error="请输入卡密")

    mid = _normalize_machine_id(machine_id)
    if not mid:
        return 400, _payload_base(ok=False, error="缺少本机标识，请升级客户端后重试")

    with _db_lock:
        conn = _connect()
        try:
            _migrate(conn)
            if _machine_revoked(conn, mid):
                return 403, _payload_base(
                    ok=False, error="本机授权已被吊销，无法核销，请联系发卡方"
                )

            row = conn.execute(
                "SELECT card, days, status, used_at, redeemed_by, plan FROM cards WHERE card = ?",
                (card,),
            ).fetchone()
            if row is None:
                return 404, _payload_base(ok=False, error="无效卡密")

            days = int(row["days"] or 0)
            if days <= 0:
                return 400, _payload_base(ok=False, error="卡密天数无效，未核销")

            try:
                card_plan = _normalize_plan(row["plan"])
            except (KeyError, IndexError):
                card_plan = "flagship"

            status = row["status"]
            if status == "unused":
                active = _active_plan(conn, mid)
                ok_plan, plan_err, result_plan = _redeem_plan_decision(active, card_plan)
                if not ok_plan:
                    return 409, _payload_base(ok=False, error=plan_err)

                used_at = _now_iso()
                cur = conn.execute(
                    "UPDATE cards SET status = ?, used_at = ?, redeemed_by = ? "
                    "WHERE card = ? AND status = ?",
                    ("used", used_at, mid, card, "unused"),
                )
                if cur.rowcount != 1:
                    conn.rollback()
                    row2 = conn.execute(
                        "SELECT days, used_at, redeemed_by, plan FROM cards WHERE card = ?",
                        (card,),
                    ).fetchone()
                    if row2 and (row2["redeemed_by"] or "").lower() == mid:
                        m = _get_machine(conn, mid)
                        mplan = _normalize_plan(
                            m["plan"] if m is not None else card_plan
                        )
                        return 200, _attach_token(
                            _payload_base(
                                ok=True,
                                days=int(row2["days"] or 0),
                                used_at=row2["used_at"] or "",
                                expires_at=(m["expires_at"] if m else ""),
                                replay=True,
                            ),
                            mid,
                            mplan,
                        )
                    return 409, _payload_base(ok=False, error="卡密已使用")

                expires_at, machine_plan = _stack_machine_expires(
                    conn, mid, days, result_plan
                )
                conn.commit()
                return 200, _attach_token(
                    _payload_base(
                        ok=True,
                        days=days,
                        used_at=used_at,
                        expires_at=expires_at,
                        replay=False,
                        upgraded=bool(active and result_plan != active),
                    ),
                    mid,
                    machine_plan,
                )

            bound = (row["redeemed_by"] or "").strip().lower()
            if bound and bound == mid:
                m = _get_machine(conn, mid)
                mplan = _normalize_plan(m["plan"] if m is not None else card_plan)
                return 200, _attach_token(
                    _payload_base(
                        ok=True,
                        days=days,
                        used_at=row["used_at"] or "",
                        expires_at=(m["expires_at"] if m else ""),
                        replay=True,
                    ),
                    mid,
                    mplan,
                )
            return 409, _payload_base(ok=False, error="卡密已使用")
        finally:
            conn.close()


def validate(machine_id=""):
    """启动心跳：返回服务端时间与该机登记到期/档位；可检测吊销。"""
    mid = _normalize_machine_id(machine_id)
    if not mid:
        return 400, _payload_base(ok=False, error="缺少本机标识")

    with _db_lock:
        conn = _connect()
        try:
            _migrate(conn)
            row = _get_machine(conn, mid)
            if row is None:
                return 200, _payload_base(
                    ok=True,
                    known=False,
                    revoked=False,
                    expires_at="",
                    plan="free",
                    max_accounts=1,
                )
            revoked = int(row["revoked"] or 0) != 0
            exp = row["expires_at"] or ""
            exp_dt = _parse_expires(exp)
            now = _now_utc()
            expired = exp_dt is None or exp_dt < now
            try:
                plan = _normalize_plan(row["plan"])
            except (KeyError, IndexError):
                plan = "flagship"
            data = _payload_base(
                ok=not revoked,
                known=True,
                revoked=revoked,
                expired=expired,
                expires_at=exp,
                plan=plan if not expired and not revoked else "free",
                max_accounts=(
                    _max_accounts(plan) if not expired and not revoked else 1
                ),
            )
            if not revoked and not expired:
                data = _attach_token(data, mid, plan)
            return 200, data
        finally:
            conn.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "JindouLicense/1.3"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _client_ip(self):
        # 仅当直连本机反代时信任转发头，避免公网客户端伪造 XFF 绕过限流
        peer = self.client_address[0]
        if peer in ("127.0.0.1", "::1"):
            xff = self.headers.get("X-Forwarded-For")
            if xff:
                return xff.split(",")[0].strip()
        return peer

    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # 核销 API 供桌面客户端使用，无需浏览器跨域
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length < 0 or length > MAX_BODY_BYTES:
            return None
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") if raw else "{}")
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        return payload

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path not in ("/redeem", "/validate"):
            self._send_json(404, _payload_base(ok=False, error="Not Found"))
            return

        if not allow_request(self._client_ip()):
            self._send_json(429, _payload_base(ok=False, error="请求过于频繁，请稍后再试"))
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            self._send_json(413, _payload_base(ok=False, error="请求体过大"))
            return

        payload = self._read_json()
        if payload is None:
            self._send_json(400, _payload_base(ok=False, error="无效 JSON"))
            return

        ok_sig, sig_err = _verify_request_sig(path, payload)
        if not ok_sig:
            self._send_json(401, _payload_base(ok=False, error=sig_err or "请求签名无效"))
            return

        if path == "/redeem":
            status, data = redeem(
                str(payload.get("card") or ""),
                str(payload.get("machine_id") or ""),
            )
        else:
            status, data = validate(str(payload.get("machine_id") or ""))
        self._send_json(status, data)

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/", "/health"):
            self._send_json(200, _payload_base(ok=True, service="jindou-license"))
            return
        self._send_json(404, _payload_base(ok=False, error="Not Found"))


def main():
    init_db()
    if not SIGNING_SEED:
        print("WARNING: JINDOU_SIGNING_SEED unset — license_token will not be issued")
    if not API_KEY:
        print("WARNING: JINDOU_API_KEY unset — request signature not enforced")
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("jindou-license listening on %s:%s, db=%s" % (HOST, PORT, DB_PATH))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
