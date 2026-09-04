"""授权凭证：Ed25519 验签（客户端）/ 签发（服务端同算法）+ 请求 HMAC。

Token 格式：v2.{base64url(payload_json)}.{base64url(signature)}
payload: {"m": machine_id, "e": expires_at_utc_iso, "i": issued_at_utc_iso, "g": grace_days}
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional, Tuple

# Ed25519 公钥（与服务端 JINDOU_SIGNING_SEED 对应；轮换需同时更新服务端种子与客户端）
LICENSE_VERIFY_KEY_HEX = (
    "a7ec268cfd7188093355cc4b8a87a22c4060746a18daa6a34cf511f6594a4ca4"
)

# 请求签名密钥（客户端与服务端 JINDOU_API_KEY 一致；防未授权探测 /validate）
API_REQUEST_KEY_HEX = (
    "4ddd278c4798a5b936397ae7bd0057fdc8431aada88dbf5a68622fa3a4b4e608"
)

_TOKEN_PREFIX = "v2."
_DEFAULT_SESSION_GRACE_DAYS = 2


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def _verify_key():
    from nacl.signing import VerifyKey

    return VerifyKey(bytes.fromhex(LICENSE_VERIFY_KEY_HEX))


def build_signed_token(
    *,
    machine_id: str,
    expires_at_utc: str,
    issued_at_utc: str,
    grace_days: int,
    signing_seed_hex: str,
) -> str:
    """服务端签发。signing_seed_hex 为 32 字节种子的 hex。"""
    from nacl.signing import SigningKey

    payload = {
        "m": (machine_id or "").strip().lower(),
        "e": (expires_at_utc or "").strip(),
        "i": (issued_at_utc or "").strip(),
        "g": int(grace_days),
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    sk = SigningKey(bytes.fromhex(signing_seed_hex.strip()))
    sig = sk.sign(body).signature
    return _TOKEN_PREFIX + _b64url_encode(body) + "." + _b64url_encode(sig)


def verify_license_token(
    token: str,
    *,
    expect_machine_id: Optional[str] = None,
    now_ts: Optional[float] = None,
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    校验 Ed25519 授权凭证。
    返回 (ok, error, payload)。
    """
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
        # 区分真·验签失败与运行时异常（缺 DLL / 密钥损坏等），避免一律报「签名无效」
        name = type(exc).__name__
        if name in ("BadSignatureError", "CryptoError"):
            return False, "凭证签名无效", {}
        detail = str(exc).strip()
        if detail and detail != name:
            # 例如 ModuleNotFoundError: No module named '_cffi_backend'
            short = detail.replace("No module named ", "").strip("'\"")
            return False, f"凭证验签异常（{name}: {short}）", {}
        return False, f"凭证验签异常（{name}）", {}
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

    # 短时会话：超过签发宽限必须重新联网心跳换票
    issued_ts = _parse_iso_ts(issued)
    if issued_ts is None:
        return False, "凭证签发时间无效", payload
    now = now_ts if now_ts is not None else time.time()
    if now - issued_ts > grace * 86400:
        return False, "授权会话已过期，请联网校验", payload
    if issued_ts - now > 3600:
        return False, "凭证签发时间异常", payload

    return True, "", payload


def _parse_iso_ts(value: str) -> Optional[float]:
    from datetime import datetime

    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            # 当作 UTC
            return dt.timestamp()
        return dt.timestamp()
    except ValueError:
        return None


def request_signature(
    *,
    path: str,
    machine_id: str,
    ts: str,
    body: bytes,
    api_key_hex: Optional[str] = None,
) -> str:
    key = (api_key_hex or API_REQUEST_KEY_HEX).strip()
    body_hash = hashlib.sha256(body or b"").hexdigest()
    msg = f"v1|{path}|{machine_id}|{ts}|{body_hash}".encode("utf-8")
    return hmac.new(bytes.fromhex(key), msg, hashlib.sha256).hexdigest()


def check_request_signature(
    *,
    path: str,
    machine_id: str,
    ts: str,
    body: bytes,
    signature: str,
    api_key_hex: Optional[str] = None,
    max_skew_sec: int = 300,
) -> Tuple[bool, str]:
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
