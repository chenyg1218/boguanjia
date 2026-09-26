"""阿里云核销服务单测（本地临时 SQLite）。"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "deploy" / "aliyun" / "app.py"


@pytest.fixture()
def redeem_mod(tmp_path, monkeypatch):
    db = tmp_path / "cards.db"
    monkeypatch.setenv("JINDOU_DB", str(db))
    monkeypatch.setenv(
        "JINDOU_SIGNING_SEED",
        "d8d866598e9b48b0735dad5863145ffdc36407e5cd6b12c2379e5160150f83ae",
    )
    monkeypatch.delenv("JINDOU_API_KEY", raising=False)
    name = f"jindou_aliyun_app_{tmp_path.name}"
    spec = importlib.util.spec_from_file_location(name, APP_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    # 保证能 import 同目录 license_crypto
    sys.path.insert(0, str(APP_PATH.parent))
    spec.loader.exec_module(mod)
    mod.SIGNING_SEED = os.environ["JINDOU_SIGNING_SEED"]
    mod.API_KEY = ""
    mod.init_db()
    return mod


def _insert(mod, card: str, days: int, status: str = "unused", redeemed_by: str = None, used_at: str = None):
    conn = mod._connect()
    try:
        conn.execute(
            "INSERT INTO cards (card, days, status, used_at, redeemed_by) VALUES (?, ?, ?, ?, ?)",
            (card, days, status, used_at, redeemed_by),
        )
        conn.commit()
    finally:
        conn.close()


def test_redeem_first_ok(redeem_mod):
    _insert(redeem_mod, "CARD-A", 30)
    code, data = redeem_mod.redeem("CARD-A", "a" * 32)
    assert code == 200
    assert data["ok"] is True
    assert data["days"] == 30
    assert data["replay"] is False
    assert data["used_at"]
    assert data["expires_at"]
    assert data["server_time"]
    assert str(data.get("license_token") or "").startswith("v2.")


def test_redeem_same_machine_replay(redeem_mod):
    mid = "b" * 32
    _insert(redeem_mod, "CARD-B", 7)
    code1, d1 = redeem_mod.redeem("CARD-B", mid)
    assert code1 == 200 and d1["replay"] is False
    code2, d2 = redeem_mod.redeem("CARD-B", mid)
    assert code2 == 200
    assert d2["replay"] is True
    assert d2["days"] == 7
    assert d2["used_at"] == d1["used_at"]
    assert d2["expires_at"] == d1["expires_at"]


def test_machine_stack_two_cards(redeem_mod):
    mid = "f" * 32
    _insert(redeem_mod, "CARD-S1", 10)
    _insert(redeem_mod, "CARD-S2", 10)
    _, d1 = redeem_mod.redeem("CARD-S1", mid)
    _, d2 = redeem_mod.redeem("CARD-S2", mid)
    assert d1["expires_at"] and d2["expires_at"]
    assert d2["expires_at"] > d1["expires_at"]


def test_validate_after_redeem(redeem_mod):
    mid = "11" * 16  # 32 hex chars
    _insert(redeem_mod, "CARD-V", 5)
    redeem_mod.redeem("CARD-V", mid)
    code, data = redeem_mod.validate(mid)
    assert code == 200
    assert data["known"] is True
    assert data["revoked"] is False
    assert data["expires_at"]
    assert data["server_time"]
    assert data.get("bound_platform") == ""


def test_bind_platform_first_and_lock(redeem_mod):
    mid = "22" * 16
    code, data = redeem_mod.bind_platform(mid, "douyin")
    assert code == 200
    assert data["ok"] is True
    assert data["bound_platform"] == "douyin"
    assert data["replay"] is False

    code2, data2 = redeem_mod.bind_platform(mid, "douyin")
    assert code2 == 200
    assert data2["replay"] is True
    assert data2["bound_platform"] == "douyin"

    code3, data3 = redeem_mod.bind_platform(mid, "taobao")
    assert code3 == 409
    assert data3["ok"] is False
    assert data3["bound_platform"] == "douyin"

    code4, data4 = redeem_mod.validate(mid)
    assert code4 == 200
    assert data4["known"] is False
    assert data4["bound_platform"] == "douyin"
    assert data4["plan"] == "free"


def test_validate_heals_bound_platform(redeem_mod):
    mid = "33" * 16
    _insert(redeem_mod, "CARD-H", 5)
    redeem_mod.redeem("CARD-H", mid)
    code, data = redeem_mod.validate(mid, bound_platform="kuaishou")
    assert code == 200
    assert data["bound_platform"] == "kuaishou"
    # 服务端已绑定后不可被 validate 覆盖
    code2, data2 = redeem_mod.validate(mid, bound_platform="taobao")
    assert code2 == 200
    assert data2["bound_platform"] == "kuaishou"


def test_redeem_preserves_bound_platform(redeem_mod):
    mid = "44" * 16
    assert redeem_mod.bind_platform(mid, "wxchannel")[0] == 200
    _insert(redeem_mod, "CARD-P", 10)
    code, data = redeem_mod.redeem("CARD-P", mid)
    assert code == 200
    assert data["ok"] is True
    assert data["bound_platform"] == "wxchannel"


def test_bind_platform_rejects_invalid(redeem_mod):
    code, data = redeem_mod.bind_platform("55" * 16, "not-a-platform")
    assert code == 400
    assert data["ok"] is False


def test_redeem_other_machine_forbidden(redeem_mod):
    _insert(redeem_mod, "CARD-C", 7)
    assert redeem_mod.redeem("CARD-C", "c" * 32)[0] == 200
    code, data = redeem_mod.redeem("CARD-C", "d" * 32)
    assert code == 409
    assert data["ok"] is False


def test_invalid_days_not_burned(redeem_mod):
    _insert(redeem_mod, "CARD-BAD", 0)
    code, data = redeem_mod.redeem("CARD-BAD", "e" * 32)
    assert code == 400
    conn = redeem_mod._connect()
    try:
        row = conn.execute("SELECT status FROM cards WHERE card='CARD-BAD'").fetchone()
        assert row["status"] == "unused"
    finally:
        conn.close()


def test_missing_machine_id(redeem_mod):
    _insert(redeem_mod, "CARD-D", 5)
    code, data = redeem_mod.redeem("CARD-D", "")
    assert code == 400
    assert "本机" in data["error"]


def test_revoked_machine_cannot_redeem(redeem_mod):
    mid = "aa" * 16
    _insert(redeem_mod, "CARD-R1", 10)
    assert redeem_mod.redeem("CARD-R1", mid)[0] == 200
    conn = redeem_mod._connect()
    try:
        conn.execute("UPDATE machines SET revoked=1 WHERE machine_id=?", (mid,))
        conn.commit()
    finally:
        conn.close()

    _insert(redeem_mod, "CARD-R2", 10)
    code, data = redeem_mod.redeem("CARD-R2", mid)
    assert code == 403
    assert data["ok"] is False
    assert "吊销" in data["error"]

    conn = redeem_mod._connect()
    try:
        row = conn.execute("SELECT status FROM cards WHERE card='CARD-R2'").fetchone()
        assert row["status"] == "unused"
        m = conn.execute(
            "SELECT revoked FROM machines WHERE machine_id=?", (mid,)
        ).fetchone()
        assert int(m["revoked"]) == 1
    finally:
        conn.close()


def test_stack_preserves_revoked_flag(redeem_mod):
    """即便绕过前置检查，叠加也不应把 revoked 清回 0。"""
    mid = "bb" * 16
    conn = redeem_mod._connect()
    try:
        redeem_mod._migrate(conn)
        conn.execute(
            "INSERT INTO machines (machine_id, expires_at, updated_at, revoked) "
            "VALUES (?, '2099-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)",
            (mid,),
        )
        conn.commit()
        redeem_mod._stack_machine_expires(conn, mid, 5)
        conn.commit()
        row = conn.execute(
            "SELECT revoked FROM machines WHERE machine_id=?", (mid,)
        ).fetchone()
        assert int(row["revoked"]) == 1
    finally:
        conn.close()
