"""卡密授权：阿里云核销 + 服务端到期/心跳 + 本地时钟锚定（无注册）。"""

from __future__ import annotations

import hashlib
import json
import platform
import re
import ssl
import sys
import time
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

from boguanjia.models import AccountState
from boguanjia.paths import config_dir
from boguanjia.storage import account_file_lock, load_account, save_account

try:
    from boguanjia.license_crypto import (
        API_REQUEST_KEY_HEX,
        check_request_signature,  # noqa: F401 — 供测试
        request_signature,
        verify_license_token,
    )
except ImportError:  # pragma: no cover
    API_REQUEST_KEY_HEX = ""
    request_signature = None  # type: ignore
    verify_license_token = None  # type: ignore

_LICENSE_SALT = "boguanjia-license-v2"
_LICENSE_SALT_LEGACY = "boguanjia-license-v1"
_CARD_HASH_SALT = "jindou-card-fp-v1"
_TIME_FMT = "%Y-%m-%d %H:%M:%S"
_DEMO_CARD_RE = re.compile(r"^DEMO-(\d{1,4})-(.+)$", re.IGNORECASE)
_REDEEM_RETRIES = 3
_REDEEM_USER_AGENT = "Boguanjia/2.3 (+https://jindou.local)"
_CLOCK_ROLLBACK_SEC = 3600
_DEFAULT_OFFLINE_GRACE_DAYS = 2
_MAX_OFFLINE_GRACE_DAYS = 2
# 正式核销：内置域名白名单（不读 license.json 追加，防本地扩白名单外泄卡密）
_DEFAULT_ALLOWED_HOSTS = frozenset({"license.sugaiming.com"})
_BUILTIN_REDEEM_URL = "https://license.sugaiming.com/redeem"

_cached_machine_id: Optional[str] = None


@dataclass
class RedeemResult:
    days: int = 0
    replay: bool = False
    used_at: str = ""
    expires_at: str = ""  # 服务端 UTC ISO
    server_time: str = ""
    license_token: str = ""  # 服务端 Ed25519 签发


def _now() -> datetime:
    return datetime.now()


def _fmt(dt: datetime) -> str:
    return dt.strftime(_TIME_FMT)


def _parse_time(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, _TIME_FMT)
    except ValueError:
        return None


def _parse_server_time(value: str) -> Optional[datetime]:
    """服务端时间（UTC ISO 或本地格式）→ 本地 naive。"""
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is not None:
            return dt.astimezone().replace(tzinfo=None)
        return dt
    except ValueError:
        return _parse_time(value)


def _server_expires_to_local(value: str) -> Optional[str]:
    dt = _parse_server_time(value)
    return _fmt(dt) if dt else None


def machine_fingerprint() -> str:
    """本机指纹（Windows MachineGuid 优先），用于卡密绑定防拷贝。"""
    global _cached_machine_id
    if _cached_machine_id:
        return _cached_machine_id

    parts = []
    if sys.platform == "win32":
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography"
            ) as key:
                guid, _ = winreg.QueryValueEx(key, "MachineGuid")
                if guid:
                    parts.append(f"mg:{guid}")
        except Exception:
            pass

    node = (platform.node() or "").strip()
    if node:
        parts.append(f"hn:{node}")
    try:
        parts.append(f"mac:{uuid.getnode():012x}")
    except Exception:
        pass
    if not parts:
        parts.append("unknown")

    raw = "|".join(parts)
    _cached_machine_id = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    return _cached_machine_id


def make_token(expires_at: str, machine_id: Optional[str] = None) -> str:
    """本地演示 token（仅无 redeem_url 时使用）。正式环境使用服务端 v2 凭证。"""
    mid = machine_id if machine_id is not None else machine_fingerprint()
    raw = f"{expires_at}|{mid}|{_LICENSE_SALT}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def make_token_legacy(expires_at: str) -> str:
    """旧版仅绑定到期时间的 token（用于本机平滑迁移）。"""
    raw = f"{expires_at}|{_LICENSE_SALT_LEGACY}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _is_frozen_client() -> bool:
    return bool(getattr(sys, "frozen", False))


def resolve_redeem_url(cfg: Optional[Dict[str, Any]] = None) -> str:
    """解析核销地址。打包后禁止清空/改到非白名单域名（回落内置正式 URL）。"""
    cfg = cfg if cfg is not None else load_license_config()
    configured = str(cfg.get("redeem_url") or "").strip()
    if _is_frozen_client():
        if not configured:
            return _BUILTIN_REDEEM_URL
        ok, _ = assert_safe_license_url(configured, cfg)
        return configured if ok else _BUILTIN_REDEEM_URL
    return configured


def _production_mode(cfg: Optional[Dict[str, Any]] = None) -> bool:
    return bool(resolve_redeem_url(cfg))


def token_matches(state: AccountState, machine_id: Optional[str] = None) -> bool:
    """正式：校验 Ed25519 短时凭证；演示：本地 salt token。"""
    if not state.expires_at or not state.token:
        return False
    mid = machine_id if machine_id is not None else machine_fingerprint()
    if state.machine_id and state.machine_id != mid:
        return False

    tok = state.token.strip()
    if tok.startswith("v2.") and verify_license_token is not None:
        ok, _err, payload = verify_license_token(tok, expect_machine_id=mid)
        if not ok:
            return False
        # 载荷到期须能对上本地展示到期（允许换算误差由服务端重签纠正）
        local_exp = _server_expires_to_local(str(payload.get("e") or ""))
        if local_exp and local_exp != state.expires_at:
            # 仍接受签名有效的票，以服务端 e 为准的校验在心跳里对齐
            pass
        return True

    # 生产环境拒绝可本地伪造的 salt token
    if _production_mode():
        return False
    return tok == make_token(state.expires_at, mid)


def _is_legacy_token(state: AccountState) -> bool:
    if not state.expires_at or not state.token:
        return False
    if state.token.startswith("v2."):
        return False
    return state.token == make_token_legacy(state.expires_at)


def hash_card(card: str) -> str:
    """卡密指纹（写入 applied_cards，避免明文落盘）。"""
    normalized = _normalize_card(card)
    raw = f"{normalized}|{_CARD_HASH_SALT}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def _copy_meta(account: AccountState, **overrides: Any) -> AccountState:
    base = dict(
        expires_at=account.expires_at,
        token=account.token,
        machine_id=account.machine_id,
        announcement=account.announcement,
        last_redeem_at=account.last_redeem_at,
        applied_cards=list(account.applied_cards or []),
        clock_server_at=account.clock_server_at,
        clock_local_at=account.clock_local_at,
        last_validate_at=account.last_validate_at,
    )
    base.update(overrides)
    return AccountState(**base)


def ensure_machine_bound(state: Optional[AccountState] = None) -> AccountState:
    """
    迁移 applied_cards 为哈希；旧版 salt token 在演示模式下升级为本机 salt token。
    正式环境的 v2 凭证不在此重签（须服务端签发）。
    """
    account = state if state is not None else load_account()
    if not account.expires_at or not account.token:
        return _migrate_applied_cards(account)

    mid = machine_fingerprint()
    if account.token.startswith("v2."):
        if account.machine_id != mid:
            # 绑定其它机器的票：保留原样，token_matches 会失败
            return _migrate_applied_cards(account)
        if not account.machine_id:
            updated = _copy_meta(account, machine_id=mid)
            updated = _migrate_applied_cards(updated, persist=False)
            save_account(updated)
            return updated
        return _migrate_applied_cards(account)

    if _production_mode():
        # 旧 salt 票：保留到期，等待 /validate 换发 v2
        if not account.machine_id:
            updated = _copy_meta(account, machine_id=mid)
            updated = _migrate_applied_cards(updated, persist=False)
            save_account(updated)
            return updated
        return _migrate_applied_cards(account)

    current = make_token(account.expires_at, mid)
    if account.token == current and account.machine_id == mid:
        return _migrate_applied_cards(account)

    if _is_legacy_token(account) or account.token == current:
        updated = _copy_meta(account, token=current, machine_id=mid)
        updated = _migrate_applied_cards(updated, persist=False)
        save_account(updated)
        return updated
    return _migrate_applied_cards(account)


def _migrate_applied_cards(
    account: AccountState, *, persist: bool = True
) -> AccountState:
    """明文卡密 → 指纹；已是哈希则原样保留。"""
    cards = list(account.applied_cards or [])
    if not cards:
        return account
    out: List[str] = []
    seen = set()
    changed = False
    for c in cards:
        s = str(c).strip()
        if not s:
            continue
        upper = s.upper()
        if re.fullmatch(r"[A-Fa-f0-9]{40}", s):
            fp = s.lower()
        else:
            fp = hash_card(upper)
            changed = True
        if fp in seen:
            changed = True
            continue
        seen.add(fp)
        out.append(fp)
    if not changed and out == [str(c).strip().lower() for c in cards if str(c).strip()]:
        return account
    updated = _copy_meta(account, applied_cards=out)
    if persist:
        save_account(updated)
    return updated


def load_license_config() -> Dict[str, Any]:
    """
    授权配置：正式包（frozen）只读内置资源，忽略安装目录旁任何 license.json。
    开发态优先读项目 config/license.json，便于本地 DEMO（清空 redeem_url）。
    """
    from boguanjia.builtin_config import builtin_license_config

    if _is_frozen_client():
        return builtin_license_config()

    path = config_dir() / "license.json"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return builtin_license_config()


def _allowed_license_hosts(_cfg: Optional[Dict[str, Any]] = None) -> frozenset:
    """仅内置白名单；忽略 license.json 的 allowed_hosts 字段。"""
    return _DEFAULT_ALLOWED_HOSTS


def assert_safe_license_url(
    url: str, cfg: Optional[Dict[str, Any]] = None
) -> Tuple[bool, str]:
    """仅允许 https + 内置白名单域名，防止篡改 license.json 把卡密打到第三方。"""
    raw = (url or "").strip()
    if not raw:
        return False, "未配置核销/校验地址"
    try:
        parsed = urlparse(raw)
    except Exception:
        return False, "核销地址无效"
    if parsed.scheme.lower() != "https":
        return False, "核销地址必须使用 HTTPS"
    host = (parsed.hostname or "").lower()
    if not host:
        return False, "核销地址缺少域名"
    if host not in _allowed_license_hosts(cfg):
        return False, f"核销域名不在白名单：{host}"
    if parsed.username or parsed.password:
        return False, "核销地址不能包含用户名/密码"
    return True, ""


def _offline_grace_days() -> int:
    """离线宽限：配置可缩短，不可超过内置上限（防本地改大宽限）。"""
    cfg = load_license_config()
    try:
        requested = int(cfg.get("offline_grace_days", _DEFAULT_OFFLINE_GRACE_DAYS))
    except (TypeError, ValueError):
        requested = _DEFAULT_OFFLINE_GRACE_DAYS
    return max(0, min(requested, _MAX_OFFLINE_GRACE_DAYS))


def _validate_url_from_config() -> str:
    cfg = load_license_config()
    explicit = str(cfg.get("validate_url") or "").strip()
    if explicit:
        ok, _ = assert_safe_license_url(explicit, cfg)
        if ok:
            return explicit
        # 打包后非法 validate_url 回落到由正式 redeem 推导
        if not _is_frozen_client():
            return ""
    redeem = resolve_redeem_url(cfg)
    if not redeem:
        return ""
    if redeem.rstrip("/").endswith("/redeem"):
        return redeem.rstrip("/")[: -len("/redeem")] + "/validate"
    parsed = urlparse(redeem)
    return urlunparse((parsed.scheme, parsed.netloc, "/validate", "", "", ""))


def _applied_set(state: AccountState) -> List[str]:
    return [str(c).strip().lower() for c in (state.applied_cards or []) if str(c).strip()]


def _card_already_applied(state: AccountState, card: str) -> bool:
    """兼容旧明文 applied_cards 与新哈希。"""
    applied = _applied_set(state)
    fp = hash_card(card)
    if fp in applied:
        return True
    normalized = _normalize_card(card)
    return normalized.lower() in applied


def clock_rollback_suspected(state: AccountState) -> bool:
    """本地时间相对上次同步点明显倒退。"""
    loc = _parse_time(state.clock_local_at)
    if loc is None:
        return False
    return (_now() - loc).total_seconds() < -_CLOCK_ROLLBACK_SEC


def trusted_now(state: Optional[AccountState] = None) -> datetime:
    """
    可信「现在」：优先用 server_time + 本地流逝时间。
    若检测到拨表回退，冻结在上次服务端时间，避免靠拨表续命。
    """
    if state is None:
        return _now()
    srv = _parse_server_time(state.clock_server_at)
    loc = _parse_time(state.clock_local_at)
    if srv is None or loc is None:
        return _now()
    delta = _now() - loc
    if delta.total_seconds() < -_CLOCK_ROLLBACK_SEC:
        return srv
    return srv + delta


def is_expired(expires_at: str, state: Optional[AccountState] = None) -> bool:
    dt = _parse_time(expires_at)
    if dt is None:
        return True
    return dt < trusted_now(state)


def offline_grace_ok(state: AccountState) -> bool:
    """离线宽限：正式授权必须至少成功同步过一次；超时需重新联网。"""
    if _production_mode() and not state.clock_server_at and not state.last_validate_at:
        # 杜绝「从未联网却持有伪造本地票」
        if state.token.startswith("v2."):
            # v2 票自身带签发时间，由 verify_license_token 约束
            return True
        return False
    if not state.clock_server_at and not state.last_validate_at:
        return True
    anchor = _parse_time(state.last_validate_at) or _parse_time(state.clock_local_at)
    if anchor is None:
        return True
    grace = _offline_grace_days()
    return _now() <= anchor + timedelta(days=grace)


def is_license_valid(state: Optional[AccountState] = None) -> bool:
    """本地授权是否有效（到期 + 本机绑定 + 防拨表/离线宽限）。"""
    account = state if state is not None else load_account()
    if not account.expires_at or not account.token:
        return False
    if not token_matches(account):
        return False
    if clock_rollback_suspected(account) and not account.clock_server_at:
        return False
    if clock_rollback_suspected(account):
        # 拨表后必须先联网心跳；此处仅用锚定时间判断是否过期
        pass
    if not offline_grace_ok(account):
        return False
    return not is_expired(account.expires_at, account)


def trusted_expires_at(state: AccountState) -> Optional[datetime]:
    """仅当 token 可信时信任本地到期日（用于续充叠加）。"""
    if not token_matches(state):
        return None
    return _parse_time(state.expires_at)


def _stack_expires(current: Optional[datetime], days: int, now: Optional[datetime] = None) -> str:
    base = now if now is not None else _now()
    if current is not None and current > base:
        base = current
    return _fmt(base + timedelta(days=int(days)))


def _absolute_expires_from_used_at(used_at: str, days: int) -> str:
    base = _parse_server_time(used_at) or _now()
    return _fmt(base + timedelta(days=int(days)))


def _normalize_card(card: str) -> str:
    return (card or "").strip().upper()


def _apply_clock_fields(account: AccountState, server_time: str, **overrides: Any) -> AccountState:
    local_s = _fmt(_now())
    fields = dict(
        clock_server_at=server_time or account.clock_server_at,
        clock_local_at=local_s if server_time else account.clock_local_at,
        last_validate_at=local_s if server_time else account.last_validate_at,
    )
    fields.update(overrides)
    return _copy_meta(account, **fields)


def _load_windows_certs_safe(ctx: ssl.SSLContext) -> bool:
    try:
        from ssl import Purpose, enum_certificates
    except ImportError:
        return False
    loaded = 0
    for store_name in ("CA", "ROOT"):
        try:
            for cert, encoding, trust in enum_certificates(store_name):
                if encoding != "x509_asn":
                    continue
                if trust is not True and Purpose.SERVER_AUTH.oid not in (trust or ()):
                    continue
                try:
                    ctx.load_verify_locations(cadata=cert)
                    loaded += 1
                except ssl.SSLError:
                    continue
        except PermissionError:
            continue
    return loaded > 0


def _make_ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = True
    ctx.verify_mode = ssl.CERT_REQUIRED
    if hasattr(ssl, "TLSVersion"):
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2

    if sys.platform == "win32" and _load_windows_certs_safe(ctx):
        return ctx

    try:
        ctx.load_default_certs()
    except ssl.SSLError:
        pass
    return ctx


def _format_network_error(exc: BaseException) -> str:
    text = str(exc)
    low = text.lower()
    if "not_enough_data" in low or "asn1" in low:
        return (
            "SSL 证书校验失败（系统证书库异常）。"
            "请确认已安装完整依赖，或检查网络代理后重试。"
        )
    if "timed out" in low or "timeout" in low:
        return "连接核销服务超时，请检查网络或稍后重试。"
    if "getaddrinfo" in low or "name or service" in low or "nodename" in low:
        return "无法解析核销服务域名，请检查网络 DNS。"
    return f"无法连接核销服务：{exc}"


def _http_error_message(code: int, data: Any, raw: str) -> str:
    if isinstance(data, dict):
        msg = data.get("error") or data.get("message") or data.get("detail") or data.get("title")
        if msg:
            return str(msg)
    if code == 403:
        return "核销失败（HTTP 403，访问被拒绝）"
    return f"核销失败（HTTP {code}）"


def _canonical_body_without_sig(payload: dict) -> bytes:
    cleaned = {k: v for k, v in payload.items() if k != "sig"}
    return json.dumps(
        cleaned, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def _post_json(url: str, payload: dict, timeout: float) -> Tuple[bool, str, dict]:
    path = urlparse(url).path.rstrip("/") or "/"
    mid = str(payload.get("machine_id") or machine_fingerprint())
    ts = str(int(time.time()))
    signed_payload = dict(payload)
    signed_payload["ts"] = ts
    canon = _canonical_body_without_sig(signed_payload)
    if request_signature is not None and API_REQUEST_KEY_HEX:
        signed_payload["sig"] = request_signature(
            path=path,
            machine_id=mid,
            ts=ts,
            body=canon,
        )
    body = json.dumps(
        signed_payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": _REDEEM_USER_AGENT,
    }
    ssl_ctx = _make_ssl_context()
    last_err: Optional[BaseException] = None
    data: Any = {}

    for attempt in range(_REDEEM_RETRIES):
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw) if raw else {}
            break
        except urllib.error.HTTPError as e:
            raw = ""
            try:
                raw = e.read().decode("utf-8", errors="replace")
                data = json.loads(raw) if raw else {}
            except Exception:
                data = {}
            return False, _http_error_message(e.code, data, raw), data if isinstance(data, dict) else {}
        except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError) as e:
            last_err = e.reason if isinstance(e, urllib.error.URLError) else e
            if attempt + 1 < _REDEEM_RETRIES:
                time.sleep(0.6 * (attempt + 1))
                continue
            return False, _format_network_error(last_err), {}
        except Exception as e:
            return False, f"请求异常：{e}", {}
    else:
        return False, _format_network_error(last_err or RuntimeError("未知网络错误")), {}

    if not isinstance(data, dict):
        return False, "服务返回无效数据", {}
    return True, "", data


def _redeem_via_server(
    card: str, redeem_url: str, timeout: float, machine_id: str
) -> Tuple[bool, str, RedeemResult]:
    ok, err, data = _post_json(
        redeem_url, {"card": card, "machine_id": machine_id}, timeout
    )
    if not ok and not data.get("ok"):
        # HTTP 错误已带 message
        if err:
            return False, err, RedeemResult(server_time=str(data.get("server_time") or ""))
        return False, "核销失败", RedeemResult()

    if not data.get("ok"):
        return (
            False,
            str(data.get("error") or data.get("message") or err or "卡密无效"),
            RedeemResult(server_time=str(data.get("server_time") or "")),
        )
    try:
        days = int(data.get("days", 0))
    except (TypeError, ValueError):
        days = 0
    if days <= 0:
        return False, "核销成功但未返回有效天数", RedeemResult(
            server_time=str(data.get("server_time") or "")
        )
    replay = bool(data.get("replay"))
    tip = f"补领成功，增加 {days} 天" if replay else f"核销成功，增加 {days} 天"
    return True, tip, RedeemResult(
        days=days,
        replay=replay,
        used_at=str(data.get("used_at") or ""),
        expires_at=str(data.get("expires_at") or ""),
        server_time=str(data.get("server_time") or ""),
        license_token=str(data.get("license_token") or ""),
    )


def _redeem_demo_offline(card: str) -> Tuple[bool, str, RedeemResult]:
    m = _DEMO_CARD_RE.match(card)
    if not m:
        return False, "未配置核销地址；演示可用 DEMO-30-测试", RedeemResult()
    days = int(m.group(1))
    if days <= 0 or days > 3660:
        return False, "演示卡密天数无效", RedeemResult()
    used_at = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    # 演示不设 expires_at，走本地叠加，便于单测续充
    return True, f"演示核销成功，增加 {days} 天", RedeemResult(
        days=days, replay=False, used_at=used_at, expires_at="", server_time=used_at
    )


def redeem_card(card: str) -> Tuple[bool, str, int]:
    ok, msg, result = redeem_card_ex(card)
    return ok, msg, result.days


def redeem_card_ex(card: str) -> Tuple[bool, str, RedeemResult]:
    normalized = _normalize_card(card)
    if not normalized:
        return False, "请输入卡密", RedeemResult()

    cfg = load_license_config()
    redeem_url = resolve_redeem_url(cfg)
    timeout = float(cfg.get("timeout_seconds") or 15)

    if redeem_url:
        ok_url, url_err = assert_safe_license_url(redeem_url, cfg)
        if not ok_url:
            return False, url_err, RedeemResult()
        return _redeem_via_server(
            normalized, redeem_url, timeout, machine_fingerprint()
        )
    return _redeem_demo_offline(normalized)


def _compute_new_expires(
    account: AccountState, result: RedeemResult, *, already_applied: bool
) -> Optional[str]:
    if already_applied:
        return None
    # 优先使用服务端登记的到期（防本地伪造叠加 / 清档白嫖）
    if result.expires_at:
        local = _server_expires_to_local(result.expires_at)
        if local:
            return local
    days = int(result.days)
    trusted = trusted_expires_at(account)
    now = trusted_now(account)
    if result.replay and trusted is None:
        return _absolute_expires_from_used_at(result.used_at, days)
    return _stack_expires(trusted, days, now=now)


def activate_or_renew(card: str, state: Optional[AccountState] = None) -> Tuple[bool, str, AccountState]:
    """激活或续充：服务端叠加到期为准；同卡已应用不加天。"""
    normalized = _normalize_card(card)
    if not normalized:
        account = state if state is not None else load_account()
        return False, "请输入卡密", account

    try:
        with account_file_lock():
            account = load_account()
            if state is not None and state.expires_at and token_matches(state):
                if not account.expires_at and state.expires_at:
                    account = state

            applied = _applied_set(account)
            if _card_already_applied(account, normalized):
                if is_license_valid(account):
                    return True, f"此卡密已在本机生效。到期时间：{account.expires_at}", account
                return False, "此卡密已在本机使用过，请使用新卡密续充", account

            ok, msg, result = redeem_card_ex(normalized)
            if not ok:
                return False, msg, account

            account = load_account()
            applied = _applied_set(account)
            if _card_already_applied(account, normalized):
                if is_license_valid(account):
                    return True, f"此卡密已在本机生效。到期时间：{account.expires_at}", account
                return False, "此卡密已在本机使用过，请使用新卡密续充", account

            new_expires = _compute_new_expires(account, result, already_applied=False)
            assert new_expires is not None

            cfg = load_license_config()
            announcement = str(
                cfg.get("announcement") or account.announcement or "播管家，欢迎使用"
            )
            mid = machine_fingerprint()
            card_fp = hash_card(normalized)
            # 去掉可能残留的明文同卡，只保留指纹
            applied_clean = [c for c in applied if c != normalized.lower()]
            if card_fp not in applied_clean:
                applied_clean.append(card_fp)
            # 正式：服务端 v2 凭证；演示：本地 salt token
            new_token = (result.license_token or "").strip()
            if not new_token:
                if _production_mode(cfg):
                    return False, "核销成功但未返回授权凭证，请升级服务端后重试", account
                new_token = make_token(new_expires, mid)
            elif new_token.startswith("v2.") and verify_license_token is not None:
                vok, verr, _ = verify_license_token(new_token, expect_machine_id=mid)
                if not vok:
                    return False, f"授权凭证无效：{verr}", account
            updated = _apply_clock_fields(
                account,
                result.server_time,
                expires_at=new_expires,
                token=new_token,
                machine_id=mid,
                announcement=announcement,
                last_redeem_at=_fmt(_now()),
                applied_cards=applied_clean,
            )
            save_account(updated)
            return True, f"{msg}。到期时间：{new_expires}", updated
    except TimeoutError as exc:
        account = state if state is not None else load_account()
        return False, str(exc), account


def validate_license_with_server(
    state: Optional[AccountState] = None,
) -> Tuple[bool, str, AccountState]:
    """
    向 /validate 心跳：同步 server_time，拉取服务端到期，检测吊销。
    返回 (ok, message, account)。
    """
    account = state if state is not None else load_account()
    url = _validate_url_from_config()
    if not url:
        return True, "", account

    cfg = load_license_config()
    ok_url, url_err = assert_safe_license_url(url, cfg)
    if not ok_url:
        return False, url_err, account

    timeout = float(cfg.get("timeout_seconds") or 15)
    mid = machine_fingerprint()
    ok, err, data = _post_json(url, {"machine_id": mid}, timeout)
    if not ok and not data:
        return False, err or "授权校验失败", account

    server_time = str(data.get("server_time") or "")
    if data.get("revoked"):
        cleared = _apply_clock_fields(
            account,
            server_time,
            expires_at="",
            token="",
        )
        save_account(cleared)
        return False, "授权已被吊销，请联系发卡方", cleared

    if data.get("ok") is False and data.get("error"):
        return False, str(data.get("error")), _apply_clock_fields(account, server_time)

    # 服务端无此机记录，但本地有授权 → 视为伪造/脏数据，清空
    has_local = bool(account.expires_at and account.token)
    if data.get("known") is False and has_local:
        cleared = _apply_clock_fields(
            account,
            server_time,
            expires_at="",
            token="",
            applied_cards=[],
        )
        save_account(cleared)
        return False, "服务端无此机器授权记录，请重新激活卡密", cleared

    updated = account
    if server_time:
        updated = _apply_clock_fields(account, server_time)

    server_exp = str(data.get("expires_at") or "")
    license_token = str(data.get("license_token") or "").strip()
    if data.get("known") and server_exp:
        local_exp = _server_expires_to_local(server_exp)
        if local_exp:
            new_token = license_token
            if new_token.startswith("v2.") and verify_license_token is not None:
                vok, verr, _ = verify_license_token(new_token, expect_machine_id=mid)
                if not vok:
                    return False, f"服务端凭证无效：{verr}", updated
            elif not new_token:
                return False, "服务端未返回授权凭证，请升级核销服务", updated
            updated = _copy_meta(
                updated,
                expires_at=local_exp,
                token=new_token,
                machine_id=mid,
            )

    if data.get("known") and data.get("expired"):
        save_account(updated)
        return False, f"授权已过期（服务端）。到期：{updated.expires_at or server_exp}", updated

    save_account(updated)
    if not is_license_valid(updated):
        return False, "授权无效或已过期，请激活 / 续充", updated
    return True, "", updated


def _is_network_sync_error(msg: str) -> bool:
    return any(
        key in (msg or "")
        for key in ("无法连接", "超时", "SSL", "请求异常", "DNS")
    )


def sync_license_on_startup(
    state: Optional[AccountState] = None,
) -> Tuple[AccountState, Optional[str]]:
    """
    启动时同步授权。
    返回 (account, warning_or_block_reason)。
    若返回的 reason 非空且 license 无效，调用方应打开激活窗。

    本地无到期信息时仍会请求 /validate：同机曾激活过（如复制安装目录）
    可按 machine_id 静默恢复到当前实例。
    """
    account = ensure_machine_bound(state if state is not None else load_account())
    url = _validate_url_from_config()
    if not url:
        return account, None

    empty_local = not bool(account.expires_at)
    ok, msg, updated = validate_license_with_server(account)
    if ok:
        return updated, None

    # 网络失败：本地无票时安静交给激活窗；已有票则按宽限策略
    if _is_network_sync_error(msg):
        if empty_local:
            return account, None
        if clock_rollback_suspected(account):
            return account, "检测到系统时间异常，请恢复正确时间并联网校验授权"
        if not offline_grace_ok(account):
            return account, "已超过离线使用期限，请联网后重新启动以校验授权"
        # 旧票无法本地验签：联网失败时不能放行
        if _production_mode() and not token_matches(account):
            return account, "授权凭证需联网刷新，请检查网络后重试"
        return account, None

    # 复制目录等「本地空、服务端可能有」：无记录时不弹错误；仅吊销/服务端过期提示
    if empty_local:
        if "吊销" in (msg or "") or "授权已过期（服务端）" in (msg or ""):
            return updated, msg or "授权校验未通过"
        return account, None

    return updated, msg or "授权校验未通过"
