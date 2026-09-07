"""Profile 迁移、路径与基础版门禁。"""

from __future__ import annotations

import json

import pytest

from boguanjia.launch_args import parse_launch_args
from boguanjia.paths import (
    current_profile_id,
    data_dir,
    set_current_profile,
    settings_path,
    web_profile_dir,
)
from boguanjia import profiles as profiles_mod


@pytest.fixture()
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(profiles_mod, "data_dir", lambda: tmp_path)
    import boguanjia.paths as paths_mod

    monkeypatch.setattr(paths_mod, "data_dir", lambda: tmp_path)
    set_current_profile(None)
    yield tmp_path
    set_current_profile(None)


def test_parse_launch_args_profile():
    args = parse_launch_args(["prog", "--profile", "abc123"])
    assert args.is_worker and args.profile_id == "abc123"
    args2 = parse_launch_args(["prog", "--profile=xyz"])
    assert args2.profile_id == "xyz"
    assert not parse_launch_args(["prog"]).is_worker


def test_migrate_flat_settings_to_default_profile(isolated_data):
    root = isolated_data
    (root / "settings.json").write_text(
        json.dumps({"enable_explain": True}), encoding="utf-8"
    )
    web = root / "web_profile"
    web.mkdir()
    (web / "marker.txt").write_text("ok", encoding="utf-8")

    reg = profiles_mod.ensure_profiles_migrated()
    assert len(reg.profiles) == 1
    assert reg.profiles[0].id == "default"
    assert (root / "profiles.json").is_file()
    assert (root / "profiles" / "default" / "settings.json").is_file()
    assert (root / "profiles" / "default" / "web_profile" / "marker.txt").is_file()
    assert not (root / "settings.json").exists()
    assert not (root / "web_profile").exists()


def test_settings_path_follows_current_profile(isolated_data):
    profiles_mod.ensure_profiles_migrated()
    set_current_profile("default")
    assert current_profile_id() == "default"
    sp = settings_path()
    assert sp.parent.name == "default"
    assert "profiles" in sp.parts
    wp = web_profile_dir()
    assert wp.name == "web_profile"
    assert wp.parent.name == "default"


def test_free_cannot_add_second_profile(isolated_data, monkeypatch):
    profiles_mod.ensure_profiles_migrated()
    monkeypatch.setattr(profiles_mod, "is_pro_plan", lambda: False)
    ok, msg = profiles_mod.can_add_profile(is_pro=False)
    assert not ok
    assert "基础版" in msg
    with pytest.raises(PermissionError):
        profiles_mod.add_profile("第二个", is_pro=False)


def test_pro_can_add_and_delete_profile(isolated_data, monkeypatch):
    profiles_mod.ensure_profiles_migrated()
    monkeypatch.setattr(profiles_mod, "is_pro_plan", lambda: True)

    # 避免真实进程锁依赖：删除时视为未运行
    import boguanjia.profile_runtime as rt

    monkeypatch.setattr(rt, "is_profile_running", lambda _pid: False)

    info = profiles_mod.add_profile("测试号", is_pro=True)
    assert info.id != "default"
    ids = {p.id for p in profiles_mod.list_profiles()}
    assert info.id in ids
    assert len(ids) == 2

    profiles_mod.delete_profile(info.id)
    ids2 = {p.id for p in profiles_mod.list_profiles()}
    assert info.id not in ids2
    assert "default" in ids2


def test_cannot_delete_last_profile(isolated_data, monkeypatch):
    profiles_mod.ensure_profiles_migrated()
    monkeypatch.setattr(profiles_mod, "is_pro_plan", lambda: True)
    import boguanjia.profile_runtime as rt

    monkeypatch.setattr(rt, "is_profile_running", lambda _pid: False)
    with pytest.raises(PermissionError):
        profiles_mod.delete_profile("default")
