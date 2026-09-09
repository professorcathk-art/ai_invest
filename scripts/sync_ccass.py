#!/usr/bin/env python3
"""Fetch HKEX CCASS / Yahoo ownership and POST to InvestMouse ingest.

Run the whole watchlist in one process:

    python3 scripts/sync_ccass.py
    python3 scripts/sync_ccass.py 0700.HK 9988.HK NVDA
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccass_hkex import GAP_SEC, HkexCcassClient, build_hk_payload
from ownership_us import build_us_payload, yahoo_session

API_URL = os.getenv("INVESTMOUSE_API_URL", "").strip()
INGEST_TOKEN = os.getenv("RESEARCH_INGEST_TOKEN", "")
LIST_FILE = Path(__file__).resolve().parent / "ownership_tickers.txt"
FAILED_FILE = Path(
    os.getenv("INVESTMOUSE_FAILED_TICKERS")
    or Path.home() / "Library/Logs/investmouse-failed-tickers.txt"
)


def apply_market(tickers: list[str], market: str) -> list[str]:
    market = market.lower().strip()
    if market == "hk":
        return [t for t in tickers if t.endswith(".HK")]
    if market == "us":
        return [t for t in tickers if not t.endswith(".HK")]
    return tickers


def apply_shard(tickers: list[str], shard: str | None) -> list[str]:
    if not shard:
        return tickers
    left, right = shard.split("/", 1)
    index, parts = int(left), int(right)
    if parts < 1 or index < 1 or index > parts:
        raise ValueError(f"shard must look like 1/3, got {shard}")
    return [t for i, t in enumerate(tickers) if i % parts == index - 1]


def read_failed() -> list[str]:
    import fcntl

    if not FAILED_FILE.is_file():
        return []
    with FAILED_FILE.open("r+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        return [line.strip().upper() for line in handle if line.strip()]


def write_failed(tickers: list[str]) -> None:
    import fcntl

    FAILED_FILE.parent.mkdir(parents=True, exist_ok=True)
    unique = sorted({t.strip().upper() for t in tickers if t.strip()})
    with FAILED_FILE.open("a+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.seek(0)
        handle.truncate()
        handle.write("\n".join(unique) + ("\n" if unique else ""))


def merge_failed(add: list[str], remove: list[str]) -> None:
    current = set(read_failed())
    current.update(t.upper() for t in add)
    current.difference_update(t.upper() for t in remove)
    write_failed(sorted(current))


GENERIC_PARTY = (
    "insiders",
    "retail brokers",
    "index funds",
    "institutions",
    "smart money",
    "custodians",
    "corporate buyback",
)


def _named(rows: object) -> bool:
    if not isinstance(rows, list):
        return False
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip().lower()
        if name and name not in GENERIC_PARTY:
            return True
    return False


def has_real_metrics(payload: dict) -> bool:
    ticker = str(payload.get("ticker") or "")
    named = _named(payload.get("top_buyers")) or _named(payload.get("top_sellers"))
    if ticker.upper().endswith(".HK"):
        return named
    numbers = [
        payload.get("inst_holding_pct"),
        payload.get("insider_holding_pct"),
        payload.get("short_interest_pct"),
        payload.get("net_insider_usd"),
    ]
    return named or any(value is not None for value in numbers)


def load_tickers(extra: list[str]) -> list[str]:
    if extra:
        return [t.strip().upper() for t in extra if t.strip()]
    env = os.getenv("OWNERSHIP_TICKERS", "").strip()
    if env:
        return [t.strip().upper() for t in env.split() if t.strip()]
    tickers: list[str] = []
    if LIST_FILE.is_file():
        for line in LIST_FILE.read_text().splitlines():
            ticker = line.split("#", 1)[0].strip().upper()
            if ticker:
                tickers.append(ticker)
    return tickers or ["9988.HK", "0700.HK", "NVDA", "AAPL"]


def build_payload(ticker: str, hk_client: HkexCcassClient | None, us_session) -> dict:
    symbol = ticker.strip().upper()
    if symbol.endswith(".HK"):
        return build_hk_payload(symbol, client=hk_client)
    return build_us_payload(symbol, session_crumb=us_session)


def push_payload(payload: dict) -> int:
    if os.getenv("CCASS_DRY_RUN", "").strip() in {"1", "true", "yes"}:
        buyers = payload.get("top_buyers") or []
        print(
            f"DRY {payload.get('ticker')} {payload.get('as_of_date')} "
            f"{payload.get('signal_type')} named={len(buyers)}"
        )
        return 0
    res = requests.post(
        API_URL,
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {INGEST_TOKEN}",
        },
        timeout=30,
    )
    print(f"Ingest Status: {res.status_code}, Response: {res.text[:500]}")
    return 0 if res.ok else 1


def fetch_and_push(ticker: str, hk_client: HkexCcassClient | None = None, us_session=None) -> int:
    started = time.time()
    try:
        payload = build_payload(ticker, hk_client, us_session)
    except Exception as exc:  # noqa: BLE001 — operator log
        print(f"[{datetime.now(timezone.utc).isoformat()}] Fetch failed for {ticker}: {exc}")
        return 1

    if not has_real_metrics(payload):
        print(
            f"[{datetime.now(timezone.utc).isoformat()}] Skip {ticker}: "
            "no named CCASS participants or 13F/Form 4 fields (estimates are rejected)."
        )
        return 0

    elapsed = time.time() - started
    named = len(payload.get("top_buyers") or []) + len(payload.get("top_sellers") or [])
    print(
        f"[{datetime.now(timezone.utc).isoformat()}] Pushing {ticker} "
        f"{payload.get('signal_type')} named={named} {elapsed:.1f}s"
    )
    try:
        return push_payload(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error pushing data: {exc}")
        return 1


def run_list(tickers: list[str]) -> int:
    hk = [t for t in tickers if t.endswith(".HK")]
    us = [t for t in tickers if not t.endswith(".HK")]
    print(
        f"[{datetime.now(timezone.utc).isoformat()}] "
        f"Syncing {len(tickers)} tickers ({len(hk)} HK CCASS, {len(us)} US Yahoo) "
        f"in one process"
    )

    hk_client: HkexCcassClient | None = None
    if hk:
        hk_client = HkexCcassClient()
        market = hk_client.open()
        print(f"HKEX form open, shareholding date={market}")

    us_session = None
    if us:
        try:
            us_session = yahoo_session()
            print("Yahoo crumb session ready")
        except Exception as exc:  # noqa: BLE001
            print(f"Yahoo session failed up front ({exc}); will retry per ticker")

    failed: list[str] = []
    ok = 0
    all_names = hk + us
    for i, ticker in enumerate(all_names, 1):
        print(f"-- {i}/{len(all_names)} {ticker}")
        rc = fetch_and_push(
            ticker,
            hk_client=hk_client if ticker.endswith(".HK") else None,
            us_session=us_session if not ticker.endswith(".HK") else None,
        )
        if rc:
            failed.append(ticker)
        else:
            ok += 1
        if ticker.endswith(".HK"):
            time.sleep(GAP_SEC)

    if failed:
        print(f"Retrying {len(failed)} failed tickers once")
        still: list[str] = []
        for ticker in failed:
            rc = fetch_and_push(
                ticker,
                hk_client=hk_client if ticker.endswith(".HK") else None,
                us_session=us_session if not ticker.endswith(".HK") else None,
            )
            if rc:
                still.append(ticker)
            else:
                ok += 1
        failed = still

    print(
        f"[{datetime.now(timezone.utc).isoformat()}] Done ok={ok} failed={len(failed)} "
        f"failed_tickers={' '.join(failed) if failed else '-'}"
    )
    merge_failed(add=failed, remove=[t for t in all_names if t not in failed])
    return 1 if failed else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Scrape HKEX CCASS / Yahoo 13F and ingest")
    parser.add_argument("tickers", nargs="*", help="Optional subset; default is ownership_tickers.txt")
    parser.add_argument("--market", choices=("all", "hk", "us"), default="all")
    parser.add_argument("--shard", default=None, help="Split the list, e.g. 1/3")
    parser.add_argument("--retry-failed", action="store_true", help="Only retry tickers in the failed-ticker log")
    args = parser.parse_args(argv)

    if not INGEST_TOKEN or INGEST_TOKEN == "your_secret_token_here":
        if os.getenv("CCASS_DRY_RUN", "").strip() not in {"1", "true", "yes"}:
            print("RESEARCH_INGEST_TOKEN is not set.")
            return 2
    if not API_URL and os.getenv("CCASS_DRY_RUN", "").strip() not in {"1", "true", "yes"}:
        print("INVESTMOUSE_API_URL is not set.")
        return 2

    if args.retry_failed:
        tickers = read_failed()
        if not tickers:
            print(f"No failed tickers in {FAILED_FILE}")
            return 0
        print(f"Retrying {len(tickers)} failed tickers from {FAILED_FILE}")
    else:
        tickers = apply_shard(apply_market(load_tickers(args.tickers), args.market), args.shard)
    if not tickers:
        print("No tickers selected.")
        return 0
    return run_list(tickers)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
