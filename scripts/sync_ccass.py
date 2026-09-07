#!/usr/bin/env python3
"""Fetch HKEX CCASS / Yahoo ownership and POST to InvestMouse ingest."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccass_hkex import build_hk_payload
from ownership_us import build_us_payload

API_URL = os.getenv("INVESTMOUSE_API_URL", "").strip()
INGEST_TOKEN = os.getenv("RESEARCH_INGEST_TOKEN", "")


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


def build_payload(ticker: str) -> dict:
    symbol = ticker.strip().upper()
    if symbol.endswith(".HK"):
        return build_hk_payload(symbol)
    return build_us_payload(symbol)


def fetch_and_push(ticker: str = "9988.HK") -> int:
    if not INGEST_TOKEN or INGEST_TOKEN == "your_secret_token_here":
        print("RESEARCH_INGEST_TOKEN is not set.")
        return 2
    if not API_URL:
        print("INVESTMOUSE_API_URL is not set.")
        return 2

    try:
        payload = build_payload(ticker)
    except Exception as exc:  # noqa: BLE001 — operator log
        print(f"[{datetime.now(timezone.utc).isoformat()}] Fetch failed for {ticker}: {exc}")
        return 1

    if not has_real_metrics(payload):
        print(
            f"[{datetime.now(timezone.utc).isoformat()}] Skip {ticker}: "
            "no named CCASS participants or 13F/Form 4 fields (estimates are rejected)."
        )
        return 0

    print(f"[{datetime.now(timezone.utc).isoformat()}] Pushing {ticker} {payload.get('signal_type')}")
    try:
        res = requests.post(
            API_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {INGEST_TOKEN}",
            },
            timeout=30,
        )
        print(f"Ingest Status: {res.status_code}, Response: {res.text}")
        return 0 if res.ok else 1
    except Exception as exc:  # noqa: BLE001
        print(f"Error pushing data: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(fetch_and_push(sys.argv[1] if len(sys.argv) > 1 else "9988.HK"))
