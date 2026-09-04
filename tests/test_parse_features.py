"""解析与导入相关单测。"""

from boguanjia.models import (
    AppSettings,
    join_keywords,
    parse_car_nos,
    parse_keyword_import,
    split_keywords,
)


def test_parse_car_nos_range():
    assert parse_car_nos("2-4") == [2, 3, 4]
    assert parse_car_nos("1,3,5") == [1, 3, 5]
    assert parse_car_nos("2、3、5") == [2, 3, 5]
    assert parse_car_nos("3～5") == [3, 4, 5]
    assert parse_car_nos("") == []


def test_split_keywords():
    assert split_keywords("怎么拍 怎么买 怎么下单") == ["怎么拍", "怎么买", "怎么下单"]
    assert split_keywords("发货|多久|快递") == ["发货", "多久", "快递"]
    assert split_keywords("发货 | 多久 | 快递") == ["发货", "多久", "快递"]


def test_join_keywords_preserves_pipe():
    assert join_keywords("发货|多久|快递") == "发货|多久|快递"
    assert join_keywords("发货 | 多久 | 快递") == "发货|多久|快递"
    assert join_keywords("怎么拍 怎么买 怎么下单") == "怎么拍 怎么买 怎么下单"


def test_parse_keyword_import():
    text = (
        "# comment\n"
        "怎么买=点击下方小黄车即可下单\n"
        "怎么拍 怎么买 怎么下单=点击下方小黄车即可下单\n"
        "发货|多久|快递=现货现发\n"
        "无效行\n"
        "包邮=全场包邮"
    )
    pairs = parse_keyword_import(text)
    assert pairs == [
        ("怎么买", "点击下方小黄车即可下单"),
        ("怎么拍 怎么买 怎么下单", "点击下方小黄车即可下单"),
        ("发货|多久|快递", "现货现发"),
        ("包邮", "全场包邮"),
    ]


def test_settings_helpers():
    s = AppSettings(car_no="2-3")
    assert s.car_numbers() == [2, 3]


def test_settings_ignores_legacy_product_id():
    s = AppSettings.from_dict({"explain_mode": "single", "product_id": "111\n222", "car_no": "2"})
    assert "product_id" not in s.to_dict()
    assert s.car_no == "2"
    assert s.explain_by_car is True  # 旧数据无 explain_by_car 时默认按车号
