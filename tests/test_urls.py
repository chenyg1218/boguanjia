"""跟播助手 URL 判定。"""

from boguanjia.paths import ASSISTANT_URL, is_assistant_url, is_login_url, is_seller_home_url


def test_helper_url():
    assert ASSISTANT_URL == "https://zs.kwaixiaodian.com/page/helper"
    assert is_assistant_url(ASSISTANT_URL)
    assert is_assistant_url(ASSISTANT_URL + "?x=1")
    assert not is_assistant_url("https://s.kwaixiaodian.com/zone")


def test_seller_home():
    assert is_seller_home_url("https://s.kwaixiaodian.com/zone/home")
    assert not is_seller_home_url(ASSISTANT_URL)
    # zs 直播控制台子页（设置/列表等）不应回弹
    assert not is_seller_home_url("https://zs.kwaixiaodian.com/page/setting")
    assert not is_seller_home_url("https://zs.kwaixiaodian.com/page/live-list")


def test_login_url():
    assert is_login_url("https://login.kwaixiaodian.com/?biz=zone")
    assert not is_login_url(ASSISTANT_URL)
