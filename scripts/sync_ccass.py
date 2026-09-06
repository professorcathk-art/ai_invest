#!/usr/bin/env python3
"""Push HK CCASS (or US ownership) snapshots into InvestMouse.

This is a local iMac runner. Plug your CCASS scrape into `build_payload`
— do not commit scraped files or tokens. The API upserts on (ticker, as_of_date).

  export INVESTMOUSE_API_URL=http://localhost:3010/api/ownership/ingest
  export RESEARCH_INGEST_TOKEN=...
  python3 scripts/sync_ccass.py 9988.HK
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import requests

API_URL = os.getenv("INVESTMOUSE_API_URL", "http://localhost:3000/api/ownership/ingest")
INGEST_TOKEN = os.getenv("RESEARCH_INGEST_TOKEN", "")


def build_payload(ticker: str) -> dict:
    """Replace this with your local CCASS / 13F parser.

    Expected HK fields: institutional_pct, retail_pct, top_buyers, top_sellers.
    Expected US fields: inst_holding_pct, insider_holding_pct, short_interest_pct, net_insider_usd.
    """
    market = "HK" if ticker.upper().endswith(".HK") else "US"
    return {
        "ticker": ticker,
        "as_of_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "market_type": market,
        "signal_type": "NEUTRAL",
        "institutional_pct": None,
        "retail_pct": None,
        "top_buyers": [],
        "top_sellers": [],
    }


def fetch_and_push(ticker: str = "9988.HK") -> int:
    if not INGEST_TOKEN or INGEST_TOKEN == "your_secret_token_here":
        print("RESEARCH_INGEST_TOKEN is not set.")
        return 2

    print(f"[{datetime.now(timezone.utc).isoformat()}] Pushing ownership snapshot for {ticker}")
    payload = build_payload(ticker)
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
    except Exception as exc:  # noqa: BLE001 — local operator script
        print(f"Error pushing data: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(fetch_and_push(sys.argv[1] if len(sys.argv) > 1 else "9988.HK"))
