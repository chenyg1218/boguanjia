#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import cards into SQLite. Accepts D1-style SQL or plain card list."""

import argparse
import re
import sqlite3

INSERT_RE = re.compile(
    r"INSERT\s+OR\s+IGNORE\s+INTO\s+cards\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)",
    re.IGNORECASE,
)


def _parse_sql_row(cols_raw, vals_raw):
    cols = [c.strip().strip("`\"'") for c in cols_raw.split(",")]
    # naive split for quoted strings / numbers
    vals = []
    cur = ""
    in_q = False
    for ch in vals_raw:
        if ch == "'" and not in_q:
            in_q = True
            cur += ch
            continue
        if ch == "'" and in_q:
            in_q = False
            cur += ch
            continue
        if ch == "," and not in_q:
            vals.append(cur.strip())
            cur = ""
            continue
        cur += ch
    if cur.strip():
        vals.append(cur.strip())

    mapping = {}
    for i, col in enumerate(cols):
        if i >= len(vals):
            break
        raw = vals[i].strip()
        if raw.startswith("'") and raw.endswith("'"):
            mapping[col.lower()] = raw[1:-1]
        else:
            mapping[col.lower()] = raw
    card = (mapping.get("card") or "").strip().upper()
    days = int(mapping.get("days") or 0)
    plan = (mapping.get("plan") or "").strip().lower() or None
    return card, days, plan


def main():
    p = argparse.ArgumentParser()
    p.add_argument("file", help="cards_seed.sql or cards.txt")
    p.add_argument("--db", default="/opt/jindou-license/data/cards.db")
    p.add_argument("--days", type=int, default=30, help="default days for txt list")
    p.add_argument(
        "--plan",
        choices=("pro", "flagship"),
        default="flagship",
        help="default plan for txt / SQL rows without plan (pro=单平台·3个账号, flagship=无上限)",
    )
    args = p.parse_args()

    with open(args.file, "r", encoding="utf-8") as f:
        text = f.read()
    rows = []
    for m in INSERT_RE.finditer(text):
        card, days, plan = _parse_sql_row(m.group(1), m.group(2))
        if card:
            rows.append((card, days, plan or args.plan))
    if not rows:
        for line in text.splitlines():
            card = line.strip().upper()
            if not card or card.startswith("--"):
                continue
            rows.append((card, int(args.days), args.plan))

    conn = sqlite3.connect(args.db)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cards ("
            "card TEXT PRIMARY KEY NOT NULL,"
            "days INTEGER NOT NULL,"
            "status TEXT NOT NULL DEFAULT 'unused',"
            "used_at TEXT,"
            "redeemed_by TEXT,"
            "plan TEXT NOT NULL DEFAULT 'flagship')"
        )
        cols = {r[1] for r in conn.execute("PRAGMA table_info(cards)").fetchall()}
        if "redeemed_by" not in cols:
            conn.execute("ALTER TABLE cards ADD COLUMN redeemed_by TEXT")
        if "plan" not in cols:
            conn.execute(
                "ALTER TABLE cards ADD COLUMN plan TEXT NOT NULL DEFAULT 'flagship'"
            )
        n = 0
        skipped = 0
        for card, days, plan in rows:
            if int(days) <= 0:
                skipped += 1
                continue
            plan_n = "pro" if str(plan).lower() == "pro" else "flagship"
            cur = conn.execute(
                "INSERT OR IGNORE INTO cards (card, days, status, plan) "
                "VALUES (?, ?, 'unused', ?)",
                (card, days, plan_n),
            )
            n += cur.rowcount
        conn.commit()
        print(
            "imported=%s skipped_invalid_days=%s total_input=%s default_plan=%s db=%s"
            % (n, skipped, len(rows), args.plan, args.db)
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
