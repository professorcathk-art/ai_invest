"""US 13F / insider / short interest via Yahoo quoteSummary (no FMP key)."""

from __future__ import annotations

from datetime import datetime, timezone

import time

import requests

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def _raw(node: object, key: str = "raw") -> float | None:
    if not isinstance(node, dict):
        return None
    value = node.get(key)
    return float(value) if isinstance(value, (int, float)) else None


def _yahoo_session() -> tuple[requests.Session, str]:
    last_error: Exception | None = None
    for attempt in range(4):
        session = requests.Session()
        session.headers.update({"User-Agent": UA, "Accept": "application/json"})
        try:
            session.get("https://fc.yahoo.com", timeout=20, allow_redirects=True)
            crumb = session.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=20)
            if crumb.status_code == 429:
                time.sleep(2.5 * (attempt + 1))
                last_error = requests.HTTPError("Yahoo crumb 429")
                continue
            crumb.raise_for_status()
            token = crumb.text.strip()
            if token:
                return session, token
            last_error = RuntimeError("Yahoo crumb was empty.")
        except requests.RequestException as exc:
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Yahoo session failed: {last_error}")


_SESSION: tuple[requests.Session, str] | None = None


def yahoo_session() -> tuple[requests.Session, str]:
    global _SESSION
    if _SESSION is None:
        _SESSION = _yahoo_session()
    return _SESSION


def build_us_payload(ticker: str, session_crumb: tuple[requests.Session, str] | None = None) -> dict:
    global _SESSION
    symbol = ticker.strip().upper()
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            session, crumb = session_crumb or yahoo_session()
            response = session.get(
                f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
                params={
                    "modules": "defaultKeyStatistics,majorHoldersBreakdown,institutionOwnership,insiderTransactions",
                    "crumb": crumb,
                },
                timeout=25,
            )
            if response.status_code == 429:
                time.sleep(3 * (attempt + 1))
                last_error = requests.HTTPError("Yahoo quoteSummary 429")
                _SESSION = None
                session_crumb = None
                continue
            response.raise_for_status()
            result = (response.json().get("quoteSummary") or {}).get("result") or []
            if not result:
                raise RuntimeError(f"Yahoo returned no ownership modules for {symbol}.")
            return _payload_from_yahoo(symbol, result[0])
        except (requests.RequestException, RuntimeError, ValueError) as exc:
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Yahoo ownership failed for {symbol}: {last_error}")


def _payload_from_yahoo(symbol: str, block: dict) -> dict:
    stats = block.get("defaultKeyStatistics") or {}
    major = block.get("majorHoldersBreakdown") or {}
    inst = _raw(major.get("institutionsPercentHeld")) or _raw(stats.get("heldPercentInstitutions"))
    insider = _raw(major.get("insidersPercentHeld")) or _raw(stats.get("heldPercentInsiders"))
    short_pct = _raw(stats.get("shortPercentOfFloat"))
    holders = ((block.get("institutionOwnership") or {}).get("ownershipList")) or []
    buyers: list[dict] = []
    sellers: list[dict] = []
    for holder in holders:
        name = str(holder.get("organization") or "").strip()
        change = _raw((holder.get("pctChange") or {}), "raw")
        if not name or change is None:
            continue
        item = {"name": name, "change_30d": f"{change * 100:+.2f}%"}
        if change > 0:
            buyers.append(item)
        elif change < 0:
            sellers.append(item)
    buyers = buyers[:5]
    sellers = sellers[:5]
    net = 0.0
    for txn in (block.get("insiderTransactions") or {}).get("transactions") or []:
        text = str(txn.get("transactionText") or "").lower()
        value = _raw(txn.get("value")) or 0.0
        if "sale" in text or "sell" in text:
            net -= value
        elif "purchase" in text or "buy" in text:
            net += value
    if inst is None and insider is None and short_pct is None:
        raise RuntimeError(f"Yahoo ownership fields empty for {symbol}.")
    inst_pct = round(inst * 100, 2) if inst is not None else None
    insider_pct = round(insider * 100, 2) if insider is not None else None
    short = round(short_pct * 100, 2) if short_pct is not None else None
    if net > 0 and (insider_pct or 0) >= 0:
        signal = "INSIDER_BULLISH"
    elif net < 0:
        signal = "INSIDER_SELLING"
    else:
        signal = "NEUTRAL"
    return {
        "ticker": symbol,
        "as_of_date": datetime.now(timezone.utc).date().isoformat(),
        "market_type": "US",
        "inst_holding_pct": inst_pct,
        "insider_holding_pct": insider_pct,
        "short_interest_pct": short,
        "net_insider_usd": round(net, 2),
        "top_buyers": buyers,
        "top_sellers": sellers,
        "signal_type": signal,
    }
