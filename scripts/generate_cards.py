#!/usr/bin/env python3
"""生成卡密：导出发卡平台 TXT + D1 SQL。先入库 D1，再导入发卡平台。"""

from __future__ import annotations

import argparse
import secrets
import string
from datetime import datetime
from pathlib import Path

ALPHABET = string.ascii_uppercase + string.digits


def gen_card(prefix: str = "JD") -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(16))
    return f"{prefix}-{body[:4]}-{body[4:8]}-{body[8:12]}-{body[12:16]}"


def main() -> None:
    parser = argparse.ArgumentParser(description="生成月卡等卡密库存")
    parser.add_argument("--days", type=int, default=30, help="每张卡增加的天数（播管家仅用月卡 30）")
    parser.add_argument("--count", type=int, default=50, help="生成数量")
    parser.add_argument("--prefix", default="BGJP", help="卡密前缀（专业 BGJP / 旗舰 BGJF）")
    parser.add_argument(
        "--plan",
        choices=("pro", "flagship"),
        default="pro",
        help="卡密档位：pro=专业版(3账号)，flagship=旗舰版(无上限)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("out"),
        help="输出目录（相对当前工作目录）",
    )
    args = parser.parse_args()

    if args.days <= 0 or args.count <= 0:
        raise SystemExit("days / count 必须为正整数")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    cards = [gen_card(args.prefix.upper()) for _ in range(args.count)]
    # 去重（极低概率）
    cards = list(dict.fromkeys(cards))
    while len(cards) < args.count:
        cards.append(gen_card(args.prefix.upper()))
        cards = list(dict.fromkeys(cards))
    cards = cards[: args.count]

    plan = args.plan
    txt_path = args.out_dir / f"cards_for_shop_{plan}_{args.days}d_{stamp}.txt"
    sql_path = args.out_dir / f"cards_seed_{plan}_{args.days}d_{stamp}.sql"
    latest_txt = args.out_dir / f"cards_for_shop_{plan}.txt"
    latest_sql = args.out_dir / f"cards_seed_{plan}.sql"

    txt_path.write_text("\n".join(cards) + "\n", encoding="utf-8")
    latest_txt.write_text(txt_path.read_text(encoding="utf-8"), encoding="utf-8")

    lines = [
        "-- auto-generated; import to D1 BEFORE uploading the same list to card shop",
        f"-- plan={plan} (pro=3 accounts, flagship=unlimited)",
        "-- note: wrangler d1 execute does not support BEGIN/COMMIT",
    ]
    for c in cards:
        lines.append(
            "INSERT OR IGNORE INTO cards (card, days, status, plan) "
            f"VALUES ('{c}', {int(args.days)}, 'unused', '{plan}');"
        )
    sql = "\n".join(lines) + "\n"
    sql_path.write_text(sql, encoding="utf-8")
    latest_sql.write_text(sql, encoding="utf-8")

    print(f"生成 {len(cards)} 张（{args.days} 天，档位 {plan}）")
    print(f"发卡平台导入: {latest_txt}")
    print(f"D1/阿里云导入 SQL:  {latest_sql}")
    print("顺序：先导入核销库（阿里云 import_cards.py），再导入发卡平台。")
    print(
        f"阿里云示例: python3 /opt/jindou-license/import_cards.py cards_seed_{plan}.sql --plan {plan}"
    )


if __name__ == "__main__":
    main()
