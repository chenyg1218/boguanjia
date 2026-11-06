#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jindou/Boguanjia license API: redeem/validate/bind-platform/telemetry + /admin dashboard."""

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
from urllib.parse import parse_qs, urlparse

DB_PATH = os.environ.get("JINDOU_DB", "/opt/jindou-license/data/cards.db")
HOST = os.environ.get("JINDOU_HOST", "0.0.0.0")
PORT = int(os.environ.get("JINDOU_PORT", "80"))
RATE_WINDOW_S = 60.0
RATE_MAX = 30
MAX_BODY_BYTES = 65536
SIGNING_SEED = os.environ.get("JINDOU_SIGNING_SEED", "").strip()
API_KEY = os.environ.get("JINDOU_API_KEY", "").strip()
# 播管家优先 BGJ_ADMIN_PASSWORD；兼容共用进程时的 JINDOU_ADMIN_PASSWORD
ADMIN_PASSWORD = (
    os.environ.get("BGJ_ADMIN_PASSWORD") or os.environ.get("JINDOU_ADMIN_PASSWORD") or ""
).strip()
try:
    SESSION_GRACE_DAYS = max(1, min(30, int(os.environ.get("JINDOU_SESSION_GRACE_DAYS", "2"))))
except ValueError:
    SESSION_GRACE_DAYS = 2
_MACHINE_ID_RE = re.compile(r"^[a-fA-F0-9]{16,64}$")
_TIME_FMT = "%Y-%m-%d %H:%M:%S"
_ALLOWED_EVENT_NAMES = frozenset(
    {"app_launch", "platform_selected", "connect", "task_start"}
)
_ALLOWED_PROP_KEYS = frozenset(
    {"platform", "result", "reason", "task_type", "app_version", "plan"}
)
_EVENT_RETENTION_DAYS = 90
_MAX_EVENTS_PER_REQUEST = 20
# 与桌面端 shared/platforms.ts 对齐（基础/专业版单平台锁定）
_ALLOWED_PLATFORMS = frozenset(
    {
        "douyin",
        "buyin",
        "eos",
        "xiaohongshu",
        "pgy",
        "wxchannel",
        "kuaishou",
        "taobao",
    }
)
# 仅登记平台、尚无付费时长时的占位到期（视为已过期）
_PLATFORM_STUB_EXPIRES = "1970-01-01T00:00:00Z"

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


def _normalize_platform(platform):
    p = (platform or "").strip().lower()
    return p if p in _ALLOWED_PLATFORMS else ""


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
        "plan TEXT NOT NULL DEFAULT 'flagship',"
        "bound_platform TEXT NOT NULL DEFAULT '')"
    )
    mcols = {row[1] for row in conn.execute("PRAGMA table_info(machines)").fetchall()}
    if mcols and "plan" not in mcols:
        conn.execute(
            "ALTER TABLE machines ADD COLUMN plan TEXT NOT NULL DEFAULT 'flagship'"
        )
    # 重新读列：新建表已含 plan 时仍需检查 bound_platform
    mcols = {row[1] for row in conn.execute("PRAGMA table_info(machines)").fetchall()}
    if mcols and "bound_platform" not in mcols:
        conn.execute(
            "ALTER TABLE machines ADD COLUMN bound_platform TEXT NOT NULL DEFAULT ''"
        )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS events ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "machine_id TEXT NOT NULL,"
        "name TEXT NOT NULL,"
        "props TEXT NOT NULL DEFAULT '{}',"
        "created_at TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_day_name ON events(created_at, name)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_machine_day ON events(machine_id, created_at)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_name ON events(name)")


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
        "SELECT machine_id, expires_at, updated_at, revoked, plan, bound_platform "
        "FROM machines WHERE machine_id = ?",
        (mid,),
    ).fetchone()


def _row_bound_platform(row):
    if row is None:
        return ""
    try:
        return _normalize_platform(row["bound_platform"])
    except (KeyError, IndexError, TypeError):
        return ""


def _with_bound_platform(data, bound):
    if isinstance(data, dict):
        data["bound_platform"] = bound or ""
    return data


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
                        return 200, _with_bound_platform(
                            _attach_token(
                                _payload_base(
                                    ok=True,
                                    days=int(row2["days"] or 0),
                                    used_at=row2["used_at"] or "",
                                    expires_at=(m["expires_at"] if m else ""),
                                    replay=True,
                                ),
                                mid,
                                mplan,
                            ),
                            _row_bound_platform(m),
                        )
                    return 409, _payload_base(ok=False, error="卡密已使用")

                expires_at, machine_plan = _stack_machine_expires(
                    conn, mid, days, result_plan
                )
                conn.commit()
                m = _get_machine(conn, mid)
                return 200, _with_bound_platform(
                    _attach_token(
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
                    ),
                    _row_bound_platform(m),
                )

            bound = (row["redeemed_by"] or "").strip().lower()
            if bound and bound == mid:
                m = _get_machine(conn, mid)
                mplan = _normalize_plan(m["plan"] if m is not None else card_plan)
                return 200, _with_bound_platform(
                    _attach_token(
                        _payload_base(
                            ok=True,
                            days=days,
                            used_at=row["used_at"] or "",
                            expires_at=(m["expires_at"] if m else ""),
                            replay=True,
                        ),
                        mid,
                        mplan,
                    ),
                    _row_bound_platform(m),
                )
            return 409, _payload_base(ok=False, error="卡密已使用")
        finally:
            conn.close()


def validate(machine_id="", bound_platform=""):
    """启动心跳：返回服务端时间与该机登记到期/档位/绑定平台；可检测吊销。

    可选 bound_platform：若服务端尚未绑定且客户端已有合法平台，则治愈写入（防本地清后丢锁）。
    """
    mid = _normalize_machine_id(machine_id)
    if not mid:
        return 400, _payload_base(ok=False, error="缺少本机标识")

    client_plat = _normalize_platform(bound_platform)

    with _db_lock:
        conn = _connect()
        try:
            _migrate(conn)
            row = _get_machine(conn, mid)
            if row is None:
                return 200, _with_bound_platform(
                    _payload_base(
                        ok=True,
                        known=False,
                        revoked=False,
                        expires_at="",
                        plan="free",
                        max_accounts=1,
                    ),
                    "",
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
            current_bound = _row_bound_platform(row)
            # 服务端未绑定时，用客户端上报治愈；已绑定则不可被覆盖
            if not revoked and not current_bound and client_plat:
                conn.execute(
                    "UPDATE machines SET bound_platform = ?, updated_at = ? "
                    "WHERE machine_id = ? AND (bound_platform IS NULL OR bound_platform = '')",
                    (client_plat, _now_iso(), mid),
                )
                conn.commit()
                current_bound = client_plat

            # 仅平台占位（尚未核销）：known=false，但仍带回 bound_platform 供客户端锁定
            if not revoked and exp == _PLATFORM_STUB_EXPIRES:
                return 200, _with_bound_platform(
                    _payload_base(
                        ok=True,
                        known=False,
                        revoked=False,
                        expired=True,
                        expires_at="",
                        plan="free",
                        max_accounts=1,
                    ),
                    current_bound,
                )

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
            data = _with_bound_platform(data, current_bound)
            if not revoked and not expired:
                data = _attach_token(data, mid, plan)
            return 200, data
        finally:
            conn.close()


def bind_platform(machine_id="", platform=""):
    """首次绑定直播平台；已绑定则仅允许同平台重放，换绑返回 409。"""
    mid = _normalize_machine_id(machine_id)
    if not mid:
        return 400, _payload_base(ok=False, error="缺少本机标识")

    plat = _normalize_platform(platform)
    if not plat:
        return 400, _payload_base(ok=False, error="不支持的平台")

    with _db_lock:
        conn = _connect()
        try:
            _migrate(conn)
            if _machine_revoked(conn, mid):
                return 403, _with_bound_platform(
                    _payload_base(ok=False, error="本机授权已被吊销，无法绑定平台"),
                    "",
                )

            row = _get_machine(conn, mid)
            current = _row_bound_platform(row)
            if current and current != plat:
                return 409, _with_bound_platform(
                    _payload_base(
                        ok=False,
                        error="本机已绑定其他平台，无法换绑；跨平台请开通旗舰版",
                    ),
                    current,
                )
            if current == plat:
                return 200, _with_bound_platform(
                    _payload_base(ok=True, replay=True),
                    current,
                )

            updated = _now_iso()
            if row is None:
                # 基础版尚未核销卡密：登记平台占位行，validate 仍视为 known + expired
                conn.execute(
                    "INSERT INTO machines "
                    "(machine_id, expires_at, updated_at, revoked, plan, bound_platform) "
                    "VALUES (?, ?, ?, 0, 'flagship', ?)",
                    (mid, _PLATFORM_STUB_EXPIRES, updated, plat),
                )
            else:
                conn.execute(
                    "UPDATE machines SET bound_platform = ?, updated_at = ? "
                    "WHERE machine_id = ?",
                    (plat, updated, mid),
                )
            conn.commit()
            return 200, _with_bound_platform(
                _payload_base(ok=True, replay=False),
                plat,
            )
        finally:
            conn.close()


def _sanitize_event_props(raw):
    if not isinstance(raw, dict):
        return {}
    out = {}
    for key, value in raw.items():
        if key not in _ALLOWED_PROP_KEYS:
            continue
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            if abs(value) > 1e12:
                continue
            out[key] = value
            continue
        if isinstance(value, str):
            text = value.strip()
            if key == "platform":
                text = _normalize_platform(text)
                if not text:
                    continue
            elif key == "result":
                text = text.lower()
                if text not in ("ok", "fail"):
                    continue
            elif key == "plan":
                text = text.lower()
                if text not in ("free", "pro", "flagship"):
                    continue
            elif key == "reason":
                text = text[:80]
            elif key == "task_type":
                text = re.sub(r"[^a-zA-Z0-9_\-]", "", text)[:40]
            elif key == "app_version":
                text = re.sub(r"[^0-9A-Za-z.\-+_]", "", text)[:32]
            if text:
                out[key] = text
    return out


def _parse_day_start(day_text):
    raw = (day_text or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _day_bounds(day_dt):
    start = day_dt.strftime("%Y-%m-%dT00:00:00Z")
    end = (day_dt + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    return start, end


def _cleanup_old_events(conn):
    cutoff = (_now_utc() - timedelta(days=_EVENT_RETENTION_DAYS)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    conn.execute("DELETE FROM events WHERE created_at < ?", (cutoff,))


def ingest_telemetry(machine_id="", events=None):
    """写入匿名运营事件；props 仅允许白名单字段。"""
    mid = _normalize_machine_id(machine_id)
    if not mid:
        return 400, _payload_base(ok=False, error="缺少本机标识")
    if not isinstance(events, list) or not events:
        return 400, _payload_base(ok=False, error="缺少事件列表")
    if len(events) > _MAX_EVENTS_PER_REQUEST:
        return 400, _payload_base(ok=False, error="单次事件过多")

    rows = []
    now = _now_iso()
    for item in events:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if name not in _ALLOWED_EVENT_NAMES:
            continue
        props = _sanitize_event_props(item.get("props"))
        created = now
        raw_ts = str(item.get("created_at") or "").strip()
        if raw_ts:
            parsed = _parse_expires(raw_ts)
            if parsed is not None:
                # 仅接受近 48 小时内的客户端时间，防乱写历史
                skew = abs((_now_utc() - parsed).total_seconds())
                if skew <= 48 * 3600:
                    created = parsed.strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append((mid, name, json.dumps(props, ensure_ascii=True, separators=(",", ":")), created))

    if not rows:
        return 400, _payload_base(ok=False, error="无有效事件")

    with _db_lock:
        conn = _connect()
        try:
            _migrate(conn)
            conn.executemany(
                "INSERT INTO events (machine_id, name, props, created_at) VALUES (?, ?, ?, ?)",
                rows,
            )
            # 约每 50 次写入做一次清理，避免每次 DELETE
            if (int(time.time()) % 50) == 0:
                _cleanup_old_events(conn)
            conn.commit()
            return 200, _payload_base(ok=True, accepted=len(rows))
        finally:
            conn.close()


def _admin_token_expected():
    if not ADMIN_PASSWORD:
        return ""
    import hashlib
    import hmac as hmac_mod

    return hmac_mod.new(
        ADMIN_PASSWORD.encode("utf-8"),
        b"boguanjia-admin-session-v1",
        hashlib.sha256,
    ).hexdigest()


def admin_login(password=""):
    if not ADMIN_PASSWORD:
        return 503, {"ok": False, "error": "看板未启用：请配置 BGJ_ADMIN_PASSWORD"}
    import hmac as hmac_mod

    if not hmac_mod.compare_digest(str(password or ""), ADMIN_PASSWORD):
        return 401, {"ok": False, "error": "密码错误"}
    return 200, {"ok": True, "token": _admin_token_expected()}


def _prop(field):
    return "json_extract(props, '$.%s')" % field


def admin_stats(day="", days=7, platform="", plan=""):
    """聚合看板数据：概览 / 趋势 / 平台 / 任务 / 机器明细。"""
    day_dt = _parse_day_start(day) or _now_utc().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    try:
        days_n = max(1, min(90, int(days)))
    except (TypeError, ValueError):
        days_n = 7

    plat_filter = _normalize_platform(platform)
    plan_filter = (plan or "").strip().lower()
    if plan_filter not in ("free", "pro", "flagship", ""):
        plan_filter = ""

    start, end = _day_bounds(day_dt)
    trend_start_dt = day_dt - timedelta(days=days_n - 1)
    trend_start = trend_start_dt.strftime("%Y-%m-%dT00:00:00Z")

    where = ["created_at >= ?", "created_at < ?"]
    args = [start, end]
    if plat_filter:
        where.append("%s = ?" % _prop("platform"))
        args.append(plat_filter)

    where_sql = " AND ".join(where)

    with _db_lock:
        conn = _connect()
        try:
            _migrate(conn)

            def _count(name=None, extra="", extra_args=None):
                sql = "SELECT COUNT(*) AS c FROM events WHERE " + where_sql
                a = list(args)
                if name:
                    sql += " AND name = ?"
                    a.append(name)
                if extra:
                    sql += " " + extra
                    a.extend(extra_args or [])
                row = conn.execute(sql, a).fetchone()
                return int(row["c"] if row else 0)

            launches = _count("app_launch")
            dau = conn.execute(
                "SELECT COUNT(DISTINCT machine_id) AS c FROM events WHERE "
                + where_sql
                + " AND name = 'app_launch'",
                args,
            ).fetchone()
            dau_n = int(dau["c"] if dau else 0)

            task_starts = _count("task_start")
            task_machines = conn.execute(
                "SELECT COUNT(DISTINCT machine_id) AS c FROM events WHERE "
                + where_sql
                + " AND name = 'task_start'",
                args,
            ).fetchone()
            task_machines_n = int(task_machines["c"] if task_machines else 0)
            avg_tasks = (
                round(float(task_starts) / float(task_machines_n), 2)
                if task_machines_n
                else 0.0
            )

            connect_ok = _count(
                "connect",
                "AND %s = 'ok'" % _prop("result"),
            )
            connect_total = _count("connect")
            connect_rate = (
                round(100.0 * float(connect_ok) / float(connect_total), 1)
                if connect_total
                else 0.0
            )

            machines_ok_once = conn.execute(
                "SELECT COUNT(DISTINCT machine_id) AS c FROM events WHERE "
                + where_sql
                + " AND name = 'connect' AND %s = 'ok'" % _prop("result"),
                args,
            ).fetchone()
            machines_tried = conn.execute(
                "SELECT COUNT(DISTINCT machine_id) AS c FROM events WHERE "
                + where_sql
                + " AND name = 'connect'",
                args,
            ).fetchone()
            machines_ok_n = int(machines_ok_once["c"] if machines_ok_once else 0)
            machines_tried_n = int(machines_tried["c"] if machines_tried else 0)
            machine_connect_rate = (
                round(100.0 * float(machines_ok_n) / float(machines_tried_n), 1)
                if machines_tried_n
                else 0.0
            )

            now_iso = _now_iso()
            licensed = conn.execute(
                "SELECT COUNT(*) AS c FROM machines WHERE revoked = 0 "
                "AND expires_at > ? AND expires_at != ?",
                (now_iso, _PLATFORM_STUB_EXPIRES),
            ).fetchone()
            licensed_n = int(licensed["c"] if licensed else 0)

            # 趋势
            trend = []
            for i in range(days_n):
                d = trend_start_dt + timedelta(days=i)
                ds, de = _day_bounds(d)
                t_args = [ds, de]
                t_where = "created_at >= ? AND created_at < ?"
                if plat_filter:
                    t_where += " AND %s = ?" % _prop("platform")
                    t_args.append(plat_filter)
                row = conn.execute(
                    "SELECT "
                    "COUNT(DISTINCT CASE WHEN name='app_launch' THEN machine_id END) AS dau,"
                    "SUM(CASE WHEN name='app_launch' THEN 1 ELSE 0 END) AS launches,"
                    "SUM(CASE WHEN name='task_start' THEN 1 ELSE 0 END) AS tasks,"
                    "SUM(CASE WHEN name='connect' AND %s='ok' THEN 1 ELSE 0 END) AS cok,"
                    "SUM(CASE WHEN name='connect' THEN 1 ELSE 0 END) AS ctotal "
                    "FROM events WHERE %s" % (_prop("result"), t_where),
                    t_args,
                ).fetchone()
                ctotal = int(row["ctotal"] or 0)
                cok = int(row["cok"] or 0)
                trend.append(
                    {
                        "day": d.strftime("%Y-%m-%d"),
                        "dau": int(row["dau"] or 0),
                        "launches": int(row["launches"] or 0),
                        "tasks": int(row["tasks"] or 0),
                        "connect_rate": (
                            round(100.0 * float(cok) / float(ctotal), 1) if ctotal else 0.0
                        ),
                    }
                )

            # 平台分布
            platforms = []
            for row in conn.execute(
                "SELECT %s AS platform,"
                "SUM(CASE WHEN name='platform_selected' THEN 1 ELSE 0 END) AS selected,"
                "SUM(CASE WHEN name='connect' THEN 1 ELSE 0 END) AS attempts,"
                "SUM(CASE WHEN name='connect' AND %s='ok' THEN 1 ELSE 0 END) AS ok,"
                "SUM(CASE WHEN name='connect' AND %s='fail' THEN 1 ELSE 0 END) AS fail "
                "FROM events WHERE %s AND %s IS NOT NULL AND %s != '' "
                "GROUP BY 1 ORDER BY attempts DESC, selected DESC"
                % (
                    _prop("platform"),
                    _prop("result"),
                    _prop("result"),
                    where_sql,
                    _prop("platform"),
                    _prop("platform"),
                ),
                args,
            ):
                attempts = int(row["attempts"] or 0)
                ok_n = int(row["ok"] or 0)
                platforms.append(
                    {
                        "platform": row["platform"] or "",
                        "selected": int(row["selected"] or 0),
                        "attempts": attempts,
                        "ok": ok_n,
                        "fail": int(row["fail"] or 0),
                        "success_rate": (
                            round(100.0 * float(ok_n) / float(attempts), 1)
                            if attempts
                            else 0.0
                        ),
                    }
                )

            # 失败原因 Top
            fail_reasons = []
            for row in conn.execute(
                "SELECT %s AS reason, COUNT(*) AS c FROM events WHERE %s "
                "AND name='connect' AND %s='fail' AND %s IS NOT NULL AND %s != '' "
                "GROUP BY 1 ORDER BY c DESC LIMIT 10"
                % (
                    _prop("reason"),
                    where_sql,
                    _prop("result"),
                    _prop("reason"),
                    _prop("reason"),
                ),
                args,
            ):
                fail_reasons.append({"reason": row["reason"] or "", "count": int(row["c"])})

            # 任务分布
            tasks = []
            for row in conn.execute(
                "SELECT %s AS task_type, COUNT(*) AS starts, "
                "COUNT(DISTINCT machine_id) AS machines "
                "FROM events WHERE %s AND name='task_start' "
                "AND %s IS NOT NULL AND %s != '' "
                "GROUP BY 1 ORDER BY starts DESC"
                % (_prop("task_type"), where_sql, _prop("task_type"), _prop("task_type")),
                args,
            ):
                starts = int(row["starts"] or 0)
                machines_n = int(row["machines"] or 0)
                tasks.append(
                    {
                        "task_type": row["task_type"] or "",
                        "starts": starts,
                        "machines": machines_n,
                        "avg_per_machine": (
                            round(float(starts) / float(machines_n), 2) if machines_n else 0.0
                        ),
                    }
                )

            # 机器明细（短哈希）
            machine_sql = (
                "SELECT e.machine_id AS mid,"
                "SUM(CASE WHEN e.name='app_launch' THEN 1 ELSE 0 END) AS launches,"
                "SUM(CASE WHEN e.name='task_start' THEN 1 ELSE 0 END) AS tasks,"
                "MAX(CASE WHEN e.name='connect' AND "
                "json_extract(e.props, '$.result')='ok' THEN 1 ELSE 0 END) AS connected,"
                "MAX(json_extract(e.props, '$.platform')) AS platform,"
                "COALESCE(m.plan, '') AS plan,"
                "COALESCE(m.bound_platform, '') AS bound_platform "
                "FROM events e LEFT JOIN machines m ON m.machine_id = e.machine_id "
                "WHERE e.created_at >= ? AND e.created_at < ?"
            )
            m_args = [start, end]
            if plat_filter:
                machine_sql += " AND json_extract(e.props, '$.platform') = ?"
                m_args.append(plat_filter)
            if plan_filter:
                machine_sql += " AND COALESCE(m.plan, '') = ?"
                m_args.append(plan_filter)
            machine_sql += " GROUP BY e.machine_id ORDER BY launches DESC, tasks DESC LIMIT 200"

            machines = []
            for row in conn.execute(machine_sql, m_args):
                mid = row["mid"] or ""
                machines.append(
                    {
                        "machine": (mid[:8] if mid else ""),
                        "launches": int(row["launches"] or 0),
                        "tasks": int(row["tasks"] or 0),
                        "connected": bool(row["connected"]),
                        "platform": row["platform"] or row["bound_platform"] or "",
                        "plan": _normalize_plan(row["plan"]) if row["plan"] else "",
                    }
                )

            # 版本分布
            versions = []
            for row in conn.execute(
                "SELECT %s AS app_version, COUNT(DISTINCT machine_id) AS machines "
                "FROM events WHERE %s AND %s IS NOT NULL AND %s != '' "
                "GROUP BY 1 ORDER BY machines DESC LIMIT 20"
                % (
                    _prop("app_version"),
                    where_sql,
                    _prop("app_version"),
                    _prop("app_version"),
                ),
                args,
            ):
                versions.append(
                    {
                        "app_version": row["app_version"] or "",
                        "machines": int(row["machines"] or 0),
                    }
                )

            return 200, {
                "ok": True,
                "day": day_dt.strftime("%Y-%m-%d"),
                "days": days_n,
                "overview": {
                    "dau": dau_n,
                    "launches": launches,
                    "task_starts": task_starts,
                    "task_machines": task_machines_n,
                    "avg_tasks_per_machine": avg_tasks,
                    "connect_ok": connect_ok,
                    "connect_total": connect_total,
                    "connect_rate": connect_rate,
                    "machine_connect_rate": machine_connect_rate,
                    "licensed_machines": licensed_n,
                },
                "trend": trend,
                "platforms": platforms,
                "fail_reasons": fail_reasons,
                "tasks": tasks,
                "machines": machines,
                "versions": versions,
            }
        finally:
            conn.close()


def _admin_html_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin_dashboard.html")


class Handler(BaseHTTPRequestHandler):
    server_version = "JindouLicense/1.5"

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

    def _admin_authorized(self):
        import hmac as hmac_mod

        expect = _admin_token_expected()
        if not expect:
            return False
        got = (self.headers.get("X-Admin-Token") or "").strip()
        if not got:
            return False
        return hmac_mod.compare_digest(got, expect)

    def _send_html(self, status, body_bytes):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body_bytes)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body_bytes)

    def _send_text(self, status, text, content_type="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path not in (
            "/redeem",
            "/validate",
            "/bind-platform",
            "/telemetry",
            "/admin/login",
        ):
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

        if path == "/admin/login":
            status, data = admin_login(str(payload.get("password") or ""))
            self._send_json(status, data)
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
        elif path == "/bind-platform":
            status, data = bind_platform(
                str(payload.get("machine_id") or ""),
                str(payload.get("platform") or ""),
            )
        elif path == "/telemetry":
            status, data = ingest_telemetry(
                str(payload.get("machine_id") or ""),
                payload.get("events"),
            )
        else:
            status, data = validate(
                str(payload.get("machine_id") or ""),
                str(payload.get("bound_platform") or ""),
            )
        self._send_json(status, data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path in ("/", "/health"):
            self._send_json(200, _payload_base(ok=True, service="jindou-license"))
            return

        if path in ("/admin", "/admin/"):
            # 不 302 到绝对 /admin/：经 nginx /bgj/ 反代时会丢前缀
            html_path = _admin_html_path()
            if not os.path.isfile(html_path):
                self._send_text(500, "admin_dashboard.html missing")
                return
            with open(html_path, "rb") as f:
                self._send_html(200, f.read())
            return

        if path == "/admin/api/stats":
            if not ADMIN_PASSWORD:
                self._send_json(
                    503, {"ok": False, "error": "看板未启用：请配置 BGJ_ADMIN_PASSWORD"}
                )
                return
            if not self._admin_authorized():
                self._send_json(401, {"ok": False, "error": "未登录或令牌无效"})
                return
            qs = parse_qs(parsed.query or "")
            day = (qs.get("day") or [""])[0]
            days = (qs.get("days") or ["7"])[0]
            platform = (qs.get("platform") or [""])[0]
            plan = (qs.get("plan") or [""])[0]
            status, data = admin_stats(day=day, days=days, platform=platform, plan=plan)
            self._send_json(status, data)
            return

        self._send_json(404, _payload_base(ok=False, error="Not Found"))


def main():
    init_db()
    if not SIGNING_SEED:
        print("WARNING: JINDOU_SIGNING_SEED unset — license_token will not be issued")
    if not API_KEY:
        print("WARNING: JINDOU_API_KEY unset — request signature not enforced")
    if not ADMIN_PASSWORD:
        print("WARNING: BGJ_ADMIN_PASSWORD unset — /admin dashboard disabled")
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("jindou-license listening on %s:%s, db=%s" % (HOST, PORT, DB_PATH))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
