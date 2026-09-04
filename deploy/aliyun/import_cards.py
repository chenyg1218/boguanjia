#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import cards into SQLite. Accepts D1-style SQL or plain card list."""

import argparse
import re
import sqlite3

INSERT_RE = re.compile(
    r"INSERT\s+OR\s+IGNORE\s+INTO\s+cards\s*\([^)]*\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*'unused'\s*\)",
    re.IGNORECASE,
)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("file", help="cards_seed.sql or cards.txt")
    p.add_argument("--db", default="/opt/jindou-license/data/cards.db")
    p.add_argument("--days", type=int, default=30, help="default days for txt list")
    args = p.parse_args()

    with open(args.file, "r", encoding="utf-8") as f:
        text = f.read()
    rows = []
    for m in INSERT_RE.finditer(text):
        rows.append((m.group(1).upper(), int(m.group(2))))
    if not rows:
        for line in text.splitlines():
            card = line.strip().upper()
            if not card or card.startswith("--"):
                continue
            rows.append((card, int(args.days)))

    conn = sqlite3.connect(args.db)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cards ("
            "card TEXT PRIMARY KEY NOT NULL,"
            "days INTEGER NOT NULL,"
            "status TEXT NOT NULL DEFAULT 'unused',"
            "used_at TEXT,"
            "redeemed_by TEXT)"
        )
        cols = {r[1] for r in conn.execute("PRAGMA table_info(cards)").fetchall()}
        if "redeemed_by" not in cols:
            conn.execute("ALTER TABLE cards ADD COLUMN redeemed_by TEXT")
        n = 0
        skipped = 0
        for card, days in rows:
            if int(days) <= 0:
                skipped += 1
                continue
            cur = conn.execute(
                "INSERT OR IGNORE INTO cards (card, days, status) VALUES (?, ?, 'unused')",
                (card, days),
            )
            n += cur.rowcount
        conn.commit()
        print(
            "imported=%s skipped_invalid_days=%s total_input=%s db=%s"
            % (n, skipped, len(rows), args.db)
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
