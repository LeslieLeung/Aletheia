"""
Split hc3_all.jsonl into train and test sets, outputting CSV files with (text, label) columns.

Usage:
    uv run python scripts/split_dataset.py
    uv run python scripts/split_dataset.py --input data/hc3_all.jsonl --test_ratio 0.2 --min_len 50
"""

import argparse
import json
import random
import csv
from pathlib import Path


def load_jsonl(path: str) -> list[dict]:
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def expand_records(records: list[dict], min_len: int) -> list[dict]:
    """Expand each JSONL record into individual (text, label) rows."""
    rows = []
    for rec in records:
        for text in rec.get("human_answers", []):
            text = text.strip()
            if len(text) >= min_len:
                rows.append({"text": text, "label": 0})
        for text in rec.get("chatgpt_answers", []):
            text = text.strip()
            if len(text) >= min_len:
                rows.append({"text": text, "label": 1})
    return rows


def write_csv(rows: list[dict], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "label"])
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Split HC3 JSONL into train/test CSV")
    parser.add_argument("--input", default="data/hc3_all.jsonl", help="Path to input JSONL file")
    parser.add_argument("--output_dir", default="data", help="Output directory")
    parser.add_argument("--test_ratio", type=float, default=0.2, help="Fraction of data for test set (default: 0.2)")
    parser.add_argument("--min_len", type=int, default=50, help="Minimum text length in characters (default: 50)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)

    print(f"Loading data: {args.input}")
    records = load_jsonl(args.input)
    print(f"{len(records)} Q&A records loaded")

    rows = expand_records(records, args.min_len)
    print(f"{len(rows)} texts after expanding (filtered length < {args.min_len})")

    human_count = sum(1 for r in rows if r["label"] == 0)
    ai_count = sum(1 for r in rows if r["label"] == 1)
    print(f"  human: {human_count}, AI: {ai_count}")

    random.shuffle(rows)

    split_idx = int(len(rows) * (1 - args.test_ratio))
    train_rows = rows[:split_idx]
    test_rows = rows[split_idx:]

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_path = output_dir / "train.csv"
    test_path = output_dir / "test.csv"

    write_csv(train_rows, train_path)
    write_csv(test_rows, test_path)

    print("\nDone:")
    print(f"  train: {len(train_rows)} rows -> {train_path}")
    print(f"  test:  {len(test_rows)} rows -> {test_path}")


if __name__ == "__main__":
    main()
