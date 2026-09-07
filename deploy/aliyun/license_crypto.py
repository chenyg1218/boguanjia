# -*- coding: utf-8 -*-
"""授权凭证：Ed25519 签发/验签 + 请求 HMAC（兼容 Python 3.6 服务端）。"""

from __future__ import print_function

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime

try:
    from typing import Any, Dict, Optional, Tuple
except ImportError:  # pragma: no cover
    Any = Dict = Optional = Tuple = None  # type: ignore

LICENSE_VERIFY_KEY_HEX = (
    "a7ec268cfd7188093355cc4b8a87a22c4060746a18daa6a34cf511f6594a4ca4"
)
API_REQUEST_KEY_HEX = (
    "4ddd278c4798a5b936397ae7bd0057fdc8431aada88dbf5a68622fa3a4b4e608"
)

_TOKEN_PREFIX = "v2."
_DEFAULT_SESSION_GRACE_DAYS = 2


def _b64url_encode(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(text):
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def _verify_key():
    from nacl.signing import VerifyKey

    return VerifyKey(bytes.fromhex(LICENSE_VERIFY_KEY_HEX))


def _normalize_plan(plan):
    raw = (plan or "").strip().lower()
    if raw in ("pro", "professional"):
        return "pro"
    if raw in ("flagship", "ultimate", "unlimited"):
        return "flagship"
    # 旧卡密/缺省：按旗舰（无上限）兼容历史「专业版多账号」
    return "flagship"


def build_signed_token(
    machine_id,
    expires_at_utc,
    issued_at_utc,
    grace_days,
    signing_seed_hex,
    plan="flagship",
):
    from nacl.signing import SigningKey

    payload = {
        "m": (machine_id or "").strip().lower(),
        "e": (expires_at_utc or "").strip(),
        "i": (issued_at_utc or "").strip(),
        "g": int(grace_days),
        "p": _normalize_plan(plan),
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    sk = SigningKey(bytes.fromhex(signing_seed_hex.strip()))
    sig = sk.sign(body).signature
    return _TOKEN_PREFIX + _b64url_encode(body) + "." + _b64url_encode(sig)


def verify_license_token(token, expect_machine_id=None, now_ts=None):
    raw = (token or "").strip()
    if not raw.startswith(_TOKEN_PREFIX):
        return False, "非服务端签发凭证", {}
    parts = raw[len(_TOKEN_PREFIX) :].split(".")
    if len(parts) != 2:
        return False, "凭证格式错误", {}
    try:
        body = _b64url_decode(parts[0])
        sig = _b64url_decode(parts[1])
    except Exception:
        return False, "凭证编码错误", {}
    try:
        _verify_key().verify(body, sig)
    except Exception as exc:
        name = type(exc).__name__
        if name in ("BadSignatureError", "CryptoError"):
            return False, "凭证签名无效", {}
        return False, "凭证验签异常（%s）" % name, {}
    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        return False, "凭证载荷无效", {}
    if not isinstance(payload, dict):
        return False, "凭证载荷无效", {}

    mid = str(payload.get("m") or "").strip().lower()
    exp = str(payload.get("e") or "").strip()
    issued = str(payload.get("i") or "").strip()
    try:
        grace = int(payload.get("g") or _DEFAULT_SESSION_GRACE_DAYS)
    except (TypeError, ValueError):
        grace = _DEFAULT_SESSION_GRACE_DAYS
    grace = max(1, min(grace, 30))

    if expect_machine_id and mid != expect_machine_id.strip().lower():
        return False, "凭证与本机不匹配", payload
    if not mid or not exp or not issued:
        return False, "凭证字段不完整", payload

    issued_ts = _parse_iso_ts(issued)
    if issued_ts is None:
        return False, "凭证签发时间无效", payload
    now = now_ts if now_ts is not None else time.time()
    if now - issued_ts > grace * 86400:
        return False, "授权会话已过期，请联网校验", payload
    if issued_ts - now > 3600:
        return False, "凭证签发时间异常", payload

    return True, "", payload


def _parse_iso_ts(value):
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1]
            dt = datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S")
            # treat as UTC epoch approx via time.mktime after replacing as UTC
            return (
                datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S") - datetime(1970, 1, 1)
            ).total_seconds()
        if "T" in raw:
            return (
                datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S") - datetime(1970, 1, 1)
            ).total_seconds()
        return (
            datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S") - datetime(1970, 1, 1)
        ).total_seconds()
    except ValueError:
        return None


def request_signature(path, machine_id, ts, body, api_key_hex=None):
    key = (api_key_hex or API_REQUEST_KEY_HEX).strip()
    body_hash = hashlib.sha256(body or b"").hexdigest()
    msg = "v1|%s|%s|%s|%s" % (path, machine_id, ts, body_hash)
    return hmac.new(bytes.fromhex(key), msg.encode("utf-8"), hashlib.sha256).hexdigest()


def check_request_signature(
    path, machine_id, ts, body, signature, api_key_hex=None, max_skew_sec=300
):
    try:
        ts_i = int(str(ts).strip())
    except (TypeError, ValueError):
        return False, "时间戳无效"
    now = int(time.time())
    if abs(now - ts_i) > max_skew_sec:
        return False, "请求已过期，请校准系统时间"
    expect = request_signature(
        path=path,
        machine_id=machine_id,
        ts=str(ts_i),
        body=body,
        api_key_hex=api_key_hex,
    )
    if not hmac.compare_digest(expect, (signature or "").strip().lower()):
        return False, "请求签名无效"
    return True, ""
