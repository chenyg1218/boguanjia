"""领域模型。"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import List, Optional, Tuple


@dataclass
class KeywordReply:
    id: int
    keyword: str
    reply: str

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "KeywordReply":
        return cls(
            id=int(data.get("id", 0)),
            keyword=str(data.get("keyword", "")),
            reply=str(data.get("reply", "")),
        )


def parse_car_nos(text: str) -> List[int]:
    """解析几号车：支持 `2`、`2-4`、`1,3,5`、`1，3-5`。"""
    raw = (text or "").strip()
    if not raw:
        return []
    out: List[int] = []
    for part in re.split(r"[,，、\s]+", raw):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(\d+)\s*[-~～到至]\s*(\d+)$", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a > b:
                a, b = b, a
            out.extend(range(a, b + 1))
            continue
        if part.isdigit():
            out.append(int(part))
    # 去重保序，限制合理范围
    seen = set()
    uniq: List[int] = []
    for n in out:
        if n < 1 or n > 200 or n in seen:
            continue
        seen.add(n)
        uniq.append(n)
    return uniq


def split_keywords(keyword_field: str) -> List[str]:
    """将关键字列拆成触发词：支持空格或 | 分隔。"""
    raw = (keyword_field or "").strip()
    if not raw:
        return []
    parts = re.split(r"[\s|]+", raw)
    return [p for p in parts if p]


def join_keywords(keyword_field: str, parts: Optional[List[str]] = None) -> str:
    """按原输入分隔符拼回关键字列：含 | 则保留 |，否则用空格。"""
    parts = parts if parts is not None else split_keywords(keyword_field)
    if not parts:
        return ""
    sep = "|" if "|" in (keyword_field or "") else " "
    return sep.join(parts)


def parse_keyword_import(text: str) -> List[Tuple[str, str]]:
    """
    导入关键词。每行一条：
    - 单关键字：关键字=回复内容
    - 多关键字（同义触发，空格或 | 分隔，保存在同一条）：
      关键字1 关键字2 关键字3=回复内容
      关键字1|关键字2|关键字3=回复内容
    使用 | 时原样保留 |，不用空格替换。
    """
    pairs: List[Tuple[str, str]] = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        left, right = line.split("=", 1)
        left, right = left.strip(), right.strip()
        if not left or not right:
            continue
        kws = split_keywords(left)
        if not kws:
            continue
        pairs.append((join_keywords(left, kws), right))
    return pairs


KEYWORD_MULTI_TIP = (
    "多词规则：同一条可用空格或 | 分隔多个触发词，\n"
    "说到其中任意一个词都会触发同一条回复。\n\n"
    "示例：\n"
    "怎么拍 怎么买 怎么下单\n"
    "发货|多久|快递"
)

KEYWORD_IMPORT_HELP = (
    "每行一条关键词规则：\n\n"
    "单关键字：\n"
    "关键字=回复内容\n\n"
    "多关键字（同义触发，空格或 | 分隔，同一条）：\n"
    "关键字1 关键字2 关键字3=回复内容\n"
    "关键字1|关键字2|关键字3=回复内容\n"
    "→ 说到其中任意一个词都会触发同一条回复。\n"
    "→ 使用 | 时会原样保留，不会改成空格。\n\n"
    "等于号前面是关键字（或关键字组），后面是自动回复话术。\n"
    "可在关键词表区域右键粘贴批量导入。\n"
    "以 # 开头的行会忽略。\n\n"
    "示例：\n"
    "怎么买=点击下方小黄车即可下单\n"
    "怎么拍 怎么买 怎么下单=点击下方小黄车即可下单\n"
    "发货|多久|快递=亲，我们都是现货现发"
)


@dataclass
class AppSettings:
    dwell_seconds: int = 300
    dwell_interval_mode: str = "fixed"  # fixed | random
    dwell_min_seconds: int = 30
    dwell_max_seconds: int = 60
    danmu_interval_seconds: int = 300
    danmu_interval_mode: str = "fixed"  # fixed | random
    danmu_interval_min_seconds: int = 30
    danmu_interval_max_seconds: int = 60
    enable_explain: bool = True
    enable_danmu: bool = False
    enable_reply: bool = False
    explain_mode: str = "single"  # single | sequential | random
    explain_by_car: bool = False  # 默认「单品讲解」；True=按车号
    car_no: str = ""  # 支持区间 2-4
    danmu_text: str = ""
    keyword_replies: List[dict] = field(default_factory=list)

    def keyword_items(self) -> List[KeywordReply]:
        return [
            KeywordReply.from_dict(x)
            for x in (self.keyword_replies or [])
            if isinstance(x, dict)
        ]

    def car_numbers(self) -> List[int]:
        return parse_car_nos(self.car_no)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Optional[dict]) -> "AppSettings":
        if not data:
            return cls()
        known = cls.__dataclass_fields__  # type: ignore[attr-defined]
        # 忽略已废弃的讲解 product_id 等未知字段
        kwargs = {k: v for k, v in data.items() if k in known}
        # 旧版无 explain_by_car：原先 UI 始终按车号填写
        if "explain_by_car" not in data and "explain_mode" in data:
            kwargs["explain_by_car"] = True
        # 规范化模式字段
        mode = str(kwargs.get("explain_mode") or "single")
        if mode not in ("single", "sequential", "random"):
            kwargs["explain_mode"] = "single"
        for key in ("dwell_interval_mode", "danmu_interval_mode"):
            if key in kwargs and str(kwargs[key]) not in ("fixed", "random"):
                kwargs[key] = "fixed"
        return cls(**kwargs)


@dataclass
class AccountState:
    """本地卡密授权状态（无账号注册）。"""

    expires_at: str = ""
    token: str = ""
    machine_id: str = ""  # 绑定本机指纹
    announcement: str = "播管家，欢迎使用"
    last_redeem_at: str = ""
    # 已在本机成功叠加过的卡密（防同卡重复加天 / 配合服务端 replay）
    applied_cards: List[str] = field(default_factory=list)
    # 时钟锚定：上次同步的服务端时间 / 当时的本地时间（防拨表）
    clock_server_at: str = ""
    clock_local_at: str = ""
    last_validate_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Optional[dict]) -> "AccountState":
        if not data:
            return cls()
        known = cls.__dataclass_fields__  # type: ignore[attr-defined]
        kwargs = {k: v for k, v in data.items() if k in known}
        cards = kwargs.get("applied_cards")
        if not isinstance(cards, list):
            kwargs["applied_cards"] = []
        else:
            # 指纹为小写 hex；旧明文卡密仍可保留原样供启动时迁移
            cleaned: List[str] = []
            for c in cards:
                s = str(c).strip()
                if not s:
                    continue
                if re.fullmatch(r"[A-Fa-f0-9]{40}", s):
                    cleaned.append(s.lower())
                else:
                    cleaned.append(s.upper())
            kwargs["applied_cards"] = cleaned
        return cls(**kwargs)


@dataclass
class LiveInfo:
    ok: bool = False
    url: str = ""
    title: str = ""
    live: bool = False
    product_count: int = 0
    message: str = ""
    account_id: str = ""
    room_id: str = ""
    first_product_id: str = ""
    first_product_name: str = ""

    def to_dict(self) -> dict:
        return asdict(self)
