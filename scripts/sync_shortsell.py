#!/usr/bin/env python3
"""Fetch official HKEX short-selling turnover files and POST to InvestMouse.

The marketing page is JavaScript. The files that actually contain the table are:

  ASHTMAIN.HTM / ASHTGEM.HTM   day close  (after ~16:00 HKT)
  MSHTMAIN.HTM / MSHTGEM.HTM   morning close (after ~12:00 HKT)

HKEX replaces yesterday's table with a placeholder overnight. Scraping
before the close must no-op — never invent shares or turnover.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import requests

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
BASE = "https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms"
FILES = (
    ("MAIN", "DAY_CLOSE", f"{BASE}/ASHTMAIN.HTM"),
    ("GEM", "DAY_CLOSE", f"{BASE}/ASHTGEM.HTM"),
    ("MAIN", "MORNING_CLOSE", f"{BASE}/MSHTMAIN.HTM"),
    ("GEM", "MORNING_CLOSE", f"{BASE}/MSHTGEM.HTM"),
)


def public_origin() -> str:
    api = os.getenv("INVESTMOUSE_API_URL", "").strip()
    if "/api/" in api:
        return api.split("/api/")[0].rstrip("/")
    job = os.getenv("INVESTMOUSE_JOB_URL", "").strip().rstrip("/")
    if job:
        return job
    site = os.getenv("INVESTMOUSE_SITE_URL", "").strip().rstrip("/")
    if site and "127.0.0.1" not in site and "localhost" not in site:
        return site
    return "https://ai-invest-dvxh.vercel.app"


def ingest_url() -> str:
    explicit = os.getenv("INVESTMOUSE_SHORTSELL_URL", "").strip()
    if explicit and "127.0.0.1" not in explicit and "localhost" not in explicit:
        return explicit
    return f"{public_origin()}/api/short-selling/ingest"


def fetch(url: str) -> str:
    res = requests.get(
        url,
        headers={"User-Agent": UA, "Accept": "text/html"},
        timeout=(8, 22),
    )
    res.raise_for_status()
    return res.text


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Scrape HKEX short-selling turnover and ingest")
    parser.add_argument("--session", choices=("auto", "day", "morning"), default="auto")
    args = parser.parse_args(argv)

    token = os.getenv("RESEARCH_INGEST_TOKEN", "").strip()
    dry = os.getenv("CCASS_DRY_RUN", "").strip().lower() in {"1", "true", "yes"}
    dest = ingest_url()
    if not dry and (not token or token == "your_secret_token_here"):
        print("RESEARCH_INGEST_TOKEN is not set.")
        return 2
    if not dry and not dest:
        print("Set INVESTMOUSE_API_URL or INVESTMOUSE_SITE_URL.")
        return 2

    wanted = FILES
    if args.session == "day":
        wanted = tuple(item for item in FILES if item[1] == "DAY_CLOSE")
    elif args.session == "morning":
        wanted = tuple(item for item in FILES if item[1] == "MORNING_CLOSE")

    sources = []
    for board, session, url in wanted:
        try:
            html = fetch(url)
        except Exception as exc:  # noqa: BLE001
            print(f"Fetch failed {board} {session}: {exc}")
            continue
        placeholder = "will be available after" in html.lower()
        print(
            f"[{datetime.now(timezone.utc).isoformat()}] "
            f"{board} {session} bytes={len(html)} placeholder={placeholder} {url}"
        )
        if placeholder:
            continue
        sources.append({"board": board, "session": session, "url": url, "html": html})

    if not sources:
        print("No published HKEX short-selling table yet — skipped (do not invent rows).")
        return 0

    payload = {"sources": sources}
    if dry:
        print(f"DRY sources={len(sources)}")
        return 0

    print(f"Ingest dest={dest}")
    res = requests.post(
        dest,
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": UA,
        },
        timeout=60,
    )
    print(f"Ingest Status: {res.status_code}, Response: {res.text[:800]}")
    return 0 if res.ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
