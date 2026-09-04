"""卡密授权与设置单测。"""

from datetime import datetime, timedelta

from boguanjia.auth import (
    activate_or_renew,
    ensure_machine_bound,
    is_expired,
    is_license_valid,
    machine_fingerprint,
    make_token,
    make_token_legacy,
    redeem_card,
)
from boguanjia.models import AccountState, AppSettings, KeywordReply
from boguanjia.storage import load_settings, save_settings


def test_ssl_context_builds():
    import ssl

    from boguanjia.auth import _make_ssl_context

    ctx = _make_ssl_context()
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode == ssl.CERT_REQUIRED


def _allow_example_host(monkeypatch, auth_mod):
    monkeypatch.setattr(
        auth_mod,
        "_DEFAULT_ALLOWED_HOSTS",
        frozenset({"license.sugaiming.com", "example.com"}),
    )


def test_redeem_worker_ssl_error_message(monkeypatch):
    import ssl

    import boguanjia.auth as auth_mod

    def _boom(*_a, **_k):
        raise ssl.SSLError("[ASN1: NOT_ENOUGH_DATA] not enough data (_ssl.c:4194)")

    monkeypatch.setattr(auth_mod, "_REDEEM_RETRIES", 1)
    monkeypatch.setattr(auth_mod.urllib.request, "urlopen", _boom)
    _allow_example_host(monkeypatch, auth_mod)
    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {"redeem_url": "https://example.com/redeem"},
    )
    ok, msg, days = redeem_card("ABCD-1234")
    assert not ok
    assert days == 0
    assert "SSL" in msg or "证书" in msg


def test_redeem_rejects_non_allowlisted_host(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {
            "redeem_url": "https://evil.example/redeem",
            "allowed_hosts": ["evil.example"],
        },
    )
    ok, msg, days = redeem_card("ABCD-1234")
    assert not ok and days == 0
    assert "白名单" in msg


def test_config_allowed_hosts_ignored(monkeypatch):
    """license.json 追加域名不得扩大白名单。"""
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {
            "redeem_url": "https://evil.example/redeem",
            "allowed_hosts": ["evil.example"],
        },
    )
    ok, msg = auth_mod.assert_safe_license_url("https://evil.example/redeem")
    assert not ok
    assert "白名单" in msg


def test_frozen_ignores_external_license_json(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.paths as paths

    evil = tmp_path / "config"
    evil.mkdir()
    (evil / "license.json").write_text(
        '{"redeem_url":"","announcement":"hacked","offline_grace_days":30}',
        encoding="utf-8",
    )
    monkeypatch.setattr(paths, "config_dir", lambda: evil)
    monkeypatch.setattr(auth_mod, "_is_frozen_client", lambda: True)
    cfg = auth_mod.load_license_config()
    assert cfg.get("redeem_url") == auth_mod._BUILTIN_REDEEM_URL
    assert cfg.get("announcement") != "hacked"
    assert auth_mod._offline_grace_days() <= auth_mod._MAX_OFFLINE_GRACE_DAYS


def test_frozen_ignores_external_selectors(tmp_path, monkeypatch):
    import sys

    import boguanjia.builtin_config as bc
    import boguanjia.paths as paths

    evil = tmp_path / "config"
    evil.mkdir()
    (evil / "selectors.json").write_text('{"product_item":".hacked"}', encoding="utf-8")
    monkeypatch.setattr(paths, "config_dir", lambda: evil)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    sel = bc.load_selectors()
    assert sel.get("product_item") == bc.builtin_selectors().get("product_item")
    assert sel.get("product_item") != ".hacked"


def test_frozen_forces_builtin_redeem_url(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(auth_mod, "_is_frozen_client", lambda: True)
    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": ""})
    assert auth_mod.resolve_redeem_url() == auth_mod._BUILTIN_REDEEM_URL
    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {"redeem_url": "https://evil.example/redeem", "allowed_hosts": ["evil.example"]},
    )
    assert auth_mod.resolve_redeem_url() == auth_mod._BUILTIN_REDEEM_URL


def test_offline_grace_capped(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {"offline_grace_days": 30},
    )
    assert auth_mod._offline_grace_days() == auth_mod._MAX_OFFLINE_GRACE_DAYS


def test_redeem_rejects_http_url(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {"redeem_url": "http://license.sugaiming.com/redeem"},
    )
    ok, msg, days = redeem_card("ABCD-1234")
    assert not ok and days == 0
    assert "HTTPS" in msg


def test_redeem_sends_custom_user_agent(monkeypatch):
    import json

    import boguanjia.auth as auth_mod

    captured = {}

    class _Resp:
        def read(self):
            return json.dumps(
                {"ok": True, "days": 7, "used_at": "2026-01-01T00:00:00Z", "replay": False}
            ).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    def _urlopen(req, timeout=None, context=None):
        captured["ua"] = req.get_header("User-agent") or req.headers.get("User-Agent")
        body = req.data.decode("utf-8") if isinstance(req.data, (bytes, bytearray)) else ""
        captured["body"] = json.loads(body) if body else {}
        return _Resp()

    monkeypatch.setattr(auth_mod.urllib.request, "urlopen", _urlopen)
    _allow_example_host(monkeypatch, auth_mod)
    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {
            "redeem_url": "https://example.com/redeem",
            "timeout_seconds": 5,
        },
    )
    monkeypatch.setattr(auth_mod, "machine_fingerprint", lambda: "a" * 32)
    ok, msg, days = redeem_card("CARD-OK")
    assert ok and days == 7
    assert captured.get("ua", "").startswith("Boguanjia/")
    assert captured["body"].get("machine_id") == "a" * 32
    assert captured["body"].get("card") == "CARD-OK"


def test_same_card_not_double_stack(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.paths as paths
    import boguanjia.storage as st

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "account_path", lambda: tmp_path / "account.json")
    monkeypatch.setattr(st, "account_encrypted_path", lambda: tmp_path / "account.dat")
    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": "", "announcement": "t"})

    ok, _, state = activate_or_renew("DEMO-10-SAME")
    assert ok
    first_exp = state.expires_at
    ok2, msg2, state2 = activate_or_renew("DEMO-10-SAME", state)
    assert ok2
    assert state2.expires_at == first_exp
    assert "已在本机生效" in msg2


def test_replay_without_local_uses_absolute_used_at(tmp_path, monkeypatch):
    """清档后同机 replay：按 used_at+days，不能从现在再白加。"""
    from boguanjia.auth import RedeemResult, _compute_new_expires
    from boguanjia.models import AccountState

    empty = AccountState()
    result = RedeemResult(
        days=10,
        replay=True,
        used_at="2020-01-01T00:00:00Z",
    )
    exp = _compute_new_expires(empty, result, already_applied=False)
    assert exp is not None
    assert exp.startswith("2020-01-")
    assert not is_license_valid(
        AccountState(expires_at=exp, token=make_token(exp), machine_id=machine_fingerprint())
    )


def test_clock_rollback_freezes_trusted_now():
    from boguanjia.auth import clock_rollback_suspected, trusted_now

    past_local = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
    state = AccountState(
        clock_server_at="2026-01-01T00:00:00Z",
        clock_local_at=past_local,
    )
    assert clock_rollback_suspected(state)
    # 倒退后 trusted_now 不应跟着本地钟回到未来
    assert trusted_now(state).year <= 2026


def test_demo_card_redeem(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod, "load_license_config", lambda: {"redeem_url": "", "announcement": "t"}
    )
    ok, msg, days = redeem_card("DEMO-30-TEST")
    assert ok
    assert days == 30
    assert "30" in msg


def test_demo_card_invalid(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod, "load_license_config", lambda: {"redeem_url": "", "announcement": "t"}
    )
    ok, msg, days = redeem_card("NOT-A-CARD")
    assert not ok
    assert days == 0


def test_activate_and_stack(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.paths as paths
    import boguanjia.storage as st

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "account_path", lambda: tmp_path / "account.json")
    monkeypatch.setattr(st, "account_encrypted_path", lambda: tmp_path / "account.dat")
    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": "", "announcement": "t"})

    ok, msg, state = activate_or_renew("DEMO-10-A")
    assert ok
    assert is_license_valid(state)
    first_exp = datetime.strptime(state.expires_at, "%Y-%m-%d %H:%M:%S")

    ok2, _, state2 = activate_or_renew("DEMO-10-B", state)
    assert ok2
    second_exp = datetime.strptime(state2.expires_at, "%Y-%m-%d %H:%M:%S")
    # 续充应在原到期基础上再加约 10 天
    assert second_exp - first_exp >= timedelta(days=9, minutes=50)


def test_tampered_expires_not_valid():
    fake = AccountState(
        expires_at=(datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d %H:%M:%S"),
        token="deadbeef",
    )
    assert not is_license_valid(fake)


def test_token_roundtrip(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": ""})
    future = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    mid = machine_fingerprint()
    state2 = AccountState(
        expires_at=future,
        token=make_token(future, mid),
        machine_id=mid,
    )
    assert is_license_valid(state2)


def test_v2_token_roundtrip(monkeypatch):
    from boguanjia.license_crypto import build_signed_token, verify_license_token

    seed = "d8d866598e9b48b0735dad5863145ffdc36407e5cd6b12c2379e5160150f83ae"
    mid = "ab" * 16
    issued = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    exp = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    tok = build_signed_token(
        machine_id=mid,
        expires_at_utc=exp,
        issued_at_utc=issued,
        grace_days=2,
        signing_seed_hex=seed,
    )
    ok, err, payload = verify_license_token(tok, expect_machine_id=mid)
    assert ok, err
    assert payload["m"] == mid

    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {"redeem_url": "https://license.sugaiming.com/redeem"},
    )
    monkeypatch.setattr(auth_mod, "machine_fingerprint", lambda: mid)
    local_exp = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
    state = AccountState(
        expires_at=local_exp,
        token=tok,
        machine_id=mid,
        clock_server_at=issued,
        clock_local_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        last_validate_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )
    assert is_license_valid(state)


def test_production_rejects_local_salt_token(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {"redeem_url": "https://license.sugaiming.com/redeem"},
    )
    future = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    mid = machine_fingerprint()
    state = AccountState(
        expires_at=future,
        token=make_token(future, mid),
        machine_id=mid,
    )
    assert not is_license_valid(state)


def test_machine_bound_rejects_other_fingerprint(monkeypatch):
    import boguanjia.auth as auth_mod

    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": ""})
    future = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    state = AccountState(
        expires_at=future,
        token=make_token(future, "machine-aaa"),
        machine_id="machine-aaa",
    )
    monkeypatch.setattr(auth_mod, "machine_fingerprint", lambda: "machine-bbb")
    assert not is_license_valid(state)


def test_legacy_token_migrates(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.paths as paths
    import boguanjia.storage as st
    from boguanjia.auth import hash_card

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "account_path", lambda: tmp_path / "account.json")
    monkeypatch.setattr(st, "account_encrypted_path", lambda: tmp_path / "account.dat")
    monkeypatch.setattr(auth_mod, "machine_fingerprint", lambda: "mid-test-001")
    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": ""})
    auth_mod._cached_machine_id = "mid-test-001"

    future = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
    legacy = AccountState(
        expires_at=future,
        token=make_token_legacy(future),
        applied_cards=["DEMO-10-LEGACY"],
    )
    # 旧版 token 不再直接视为有效，需升级
    assert not is_license_valid(legacy)
    upgraded = ensure_machine_bound(legacy)
    assert upgraded.machine_id == "mid-test-001"
    assert upgraded.token == make_token(future, "mid-test-001")
    assert is_license_valid(upgraded)
    assert hash_card("DEMO-10-LEGACY") in upgraded.applied_cards
    assert "DEMO-10-LEGACY" not in upgraded.applied_cards


def test_applied_cards_stored_as_hash(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.paths as paths
    import boguanjia.storage as st
    from boguanjia.auth import hash_card

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "account_path", lambda: tmp_path / "account.json")
    monkeypatch.setattr(st, "account_encrypted_path", lambda: tmp_path / "account.dat")
    monkeypatch.setattr(auth_mod, "load_license_config", lambda: {"redeem_url": "", "announcement": "t"})

    ok, _, state = activate_or_renew("DEMO-10-HASH")
    assert ok
    assert hash_card("DEMO-10-HASH") in state.applied_cards
    assert "DEMO-10-HASH" not in state.applied_cards
    disk = st.load_account()
    assert hash_card("DEMO-10-HASH") in disk.applied_cards


def test_expired():
    past = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    assert is_expired(past)


def test_validate_unknown_machine_clears_local_forge(tmp_path, monkeypatch):
    """服务端 known=false 时，清空本地伪造授权。"""
    import json

    import boguanjia.auth as auth_mod
    import boguanjia.paths as paths
    import boguanjia.storage as st

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "account_path", lambda: tmp_path / "account.json")
    monkeypatch.setattr(st, "account_encrypted_path", lambda: tmp_path / "account.dat")
    monkeypatch.setattr(auth_mod, "machine_fingerprint", lambda: "cc" * 16)
    auth_mod._cached_machine_id = "cc" * 16
    _allow_example_host(monkeypatch, auth_mod)
    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {
            "redeem_url": "https://example.com/redeem",
            "validate_url": "https://example.com/validate",
            "timeout_seconds": 5,
        },
    )

    future = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
    mid = "cc" * 16
    forged = AccountState(
        expires_at=future,
        token=make_token(future, mid),
        machine_id=mid,
        applied_cards=["FAKE-CARD"],
    )
    st.save_account(forged)

    class _Resp:
        def read(self):
            return json.dumps(
                {
                    "ok": True,
                    "known": False,
                    "revoked": False,
                    "expires_at": "",
                    "server_time": "2026-08-12T09:00:00Z",
                }
            ).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    monkeypatch.setattr(auth_mod.urllib.request, "urlopen", lambda *_a, **_k: _Resp())

    ok, msg, updated = auth_mod.validate_license_with_server(forged)
    assert not ok
    assert "无此机器" in msg
    assert updated.expires_at == ""
    assert updated.token == ""
    assert updated.applied_cards == []


def _patch_license_io(monkeypatch, tmp_path, auth_mod):
    import boguanjia.paths as paths
    import boguanjia.storage as st

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "account_path", lambda: tmp_path / "account.json")
    monkeypatch.setattr(st, "account_encrypted_path", lambda: tmp_path / "account.dat")
    mid = "cc" * 16
    monkeypatch.setattr(auth_mod, "machine_fingerprint", lambda: mid)
    auth_mod._cached_machine_id = mid
    _allow_example_host(monkeypatch, auth_mod)
    monkeypatch.setattr(
        auth_mod,
        "load_license_config",
        lambda: {
            "redeem_url": "https://example.com/redeem",
            "validate_url": "https://example.com/validate",
            "timeout_seconds": 5,
        },
    )
    return mid


def test_sync_restores_empty_local_from_known_machine(tmp_path, monkeypatch):
    """复制安装目录后本地无票：/validate 按本机指纹静默恢复。"""
    from boguanjia.license_crypto import build_signed_token

    import boguanjia.auth as auth_mod
    import boguanjia.storage as st

    mid = _patch_license_io(monkeypatch, tmp_path, auth_mod)
    empty = AccountState()
    st.save_account(empty)

    issued = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    exp_utc = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    tok = build_signed_token(
        machine_id=mid,
        expires_at_utc=exp_utc,
        issued_at_utc=issued,
        grace_days=2,
        signing_seed_hex="d8d866598e9b48b0735dad5863145ffdc36407e5cd6b12c2379e5160150f83ae",
    )

    monkeypatch.setattr(
        auth_mod,
        "_post_json",
        lambda *_a, **_k: (
            True,
            "",
            {
                "ok": True,
                "known": True,
                "revoked": False,
                "expired": False,
                "expires_at": exp_utc,
                "license_token": tok,
                "server_time": issued,
            },
        ),
    )

    updated, msg = auth_mod.sync_license_on_startup(empty)
    assert msg is None
    assert is_license_valid(updated)
    assert updated.token == tok
    assert updated.machine_id == mid


def test_sync_empty_local_unknown_machine_is_silent(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.storage as st

    _patch_license_io(monkeypatch, tmp_path, auth_mod)
    empty = AccountState()
    st.save_account(empty)
    monkeypatch.setattr(
        auth_mod,
        "_post_json",
        lambda *_a, **_k: (
            True,
            "",
            {
                "ok": True,
                "known": False,
                "revoked": False,
                "expires_at": "",
                "server_time": "2026-08-12T09:00:00Z",
            },
        ),
    )
    updated, msg = auth_mod.sync_license_on_startup(empty)
    assert msg is None
    assert not is_license_valid(updated)
    assert not updated.expires_at


def test_sync_empty_local_network_error_is_silent(tmp_path, monkeypatch):
    import boguanjia.auth as auth_mod
    import boguanjia.storage as st

    _patch_license_io(monkeypatch, tmp_path, auth_mod)
    empty = AccountState()
    st.save_account(empty)
    monkeypatch.setattr(
        auth_mod,
        "_post_json",
        lambda *_a, **_k: (False, "无法连接授权服务器", {}),
    )
    updated, msg = auth_mod.sync_license_on_startup(empty)
    assert msg is None
    assert not is_license_valid(updated)


def test_settings_roundtrip(tmp_path, monkeypatch):
    import boguanjia.storage as st
    import boguanjia.paths as paths

    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(st, "settings_path", lambda: tmp_path / "settings.json")

    s = AppSettings(
        enable_danmu=True,
        danmu_text="hello\nworld",
        keyword_replies=[KeywordReply(1, "有货吗", "有的亲").to_dict()],
        explain_mode="sequential",
    )
    save_settings(s)
    loaded = load_settings()
    assert loaded.enable_danmu is True
    assert "hello" in loaded.danmu_text
    assert loaded.keyword_items()[0].keyword == "有货吗"
    assert loaded.explain_mode == "sequential"
