#!/usr/bin/env python3
"""Daily public VC/PE monitor for InvestMouse.

Reads Y Combinator's public yc-oss change feed and a16z announcement URLs,
then POSTs sourced extras to /api/private-market/ingest. Does not invent
valuations or round sizes — those are filled only when a headline states them.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

UA = "InvestMouse/1.0 (research; +https://investmouse.app)"
YC_CHANGES = "https://yc-oss.github.io/api/changes/latest.json"


def site_url() -> str:
    api = os.getenv("INVESTMOUSE_API_URL", "").strip()
    if "/api/" in api:
        return api.split("/api/")[0].rstrip("/")
    job = os.getenv("INVESTMOUSE_JOB_URL", "").strip().rstrip("/")
    if job:
        return job
    explicit = os.getenv("INVESTMOUSE_SITE_URL", "").strip().rstrip("/")
    if explicit and "127.0.0.1" not in explicit and "localhost" not in explicit:
        return explicit
    return "https://ai-invest-dvxh.vercel.app"


def fetch(url: str, timeout: int = 22) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def iso_from_unix(value: object) -> str | None:
    try:
        n = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if n > 10_000_000_000:
        n = n // 1000
    return datetime.fromtimestamp(n, tz=timezone.utc).date().isoformat()


def yc_launches() -> tuple[list[dict], list[dict]]:
    payload = json.loads(fetch(YC_CHANGES))
    headlines: list[dict] = []
    deals: list[dict] = []
    for row in payload.get("added") or []:
        name = str(row.get("name") or "").strip()
        url = str(row.get("url") or "").strip()
        batch = str(row.get("batch") or "").strip()
        if not name or not url:
            continue
        title = f"{name} launches on Y Combinator ({batch})" if batch else f"{name} launches on Y Combinator"
        published = iso_from_unix(row.get("launched_at"))
        headlines.append(
            {"title": title, "url": url, "publisher": "Y Combinator", "publishedAt": published}
        )
        deals.append(
            {
                "target": name,
                "sector": str(row.get("industry") or "").strip(),
                "dealType": "YC launch",
                "leadInvestors": "Y Combinator",
                "date": published,
                "url": url,
                "publisher": "Y Combinator",
            }
        )
    return headlines, deals


def main() -> int:
    token = os.getenv("RESEARCH_INGEST_TOKEN", "").strip()
    dry = os.getenv("CCASS_DRY_RUN", "").strip().lower() in {"1", "true", "yes"}
    dest = f"{site_url()}/api/private-market/ingest"
    try:
        headlines, deals = yc_launches()
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"vc-pe fetch failed: {exc}")
        return 1
    print(f"vc-pe extras headlines={len(headlines)} yc_deals={len(deals)} dest={dest}")
    if dry:
        print(json.dumps({"headlines": headlines[:5], "deals": deals[:5]}, indent=2)[:1200])
        return 0
    if not token or token == "your_secret_token_here":
        print("RESEARCH_INGEST_TOKEN is not set.")
        return 2
    body = json.dumps({"headlines": headlines, "deals": deals}).encode("utf-8")
    req = urllib.request.Request(
        dest,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            print(f"ingest {res.status} {res.read()[:400]!r}")
            return 0
    except urllib.error.HTTPError as exc:
        print(f"ingest {exc.code} {exc.read()[:400]!r}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
