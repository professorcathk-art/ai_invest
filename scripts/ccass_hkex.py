"""Official HKEX CCASS Shareholding Search — https://www3.hkexnews.hk/sdw/search/searchsdw.aspx"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

import requests

SEARCH_URL = "https://www3.hkexnews.hk/sdw/search/searchsdw.aspx"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

INST_NEEDLES = (
    "HONGKONG AND SHANGHAI BANKING",
    "THE HONGKONG AND SHANGHAI",
    "HSBC",
    "CITIBANK",
    "CITIGROUP",
    "J.P. MORGAN",
    "JPMORGAN",
    "JP MORGAN",
    "GOLDMAN SACHS",
    "MORGAN STANLEY",
    "STANDARD CHARTERED",
    "BNP PARIBAS",
    "BANK OF CHINA (HONG KONG)",
    "INDUSTRIAL AND COMMERCIAL BANK OF CHINA",
    "CHINA CONSTRUCTION BANK",
    "AGRICULTURAL BANK OF CHINA",
    "BANK OF COMMUNICATIONS",
    "DBS BANK",
    "UBS ",
    "UBS SECURITIES",
    "DEUTSCHE BANK",
    "BARCLAYS",
    "NORTHERN TRUST",
    "STATE STREET",
    "BROWN BROTHERS",
    "BANK OF NEW YORK",
    "BNY ",
    "MIZUHO",
    "MUFG",
    "BANK OF TOKYO",
    "SOCIETE GENERALE",
    "SOCIÉTÉ GÉNÉRALE",
    "CREDIT AGRICOLE",
    "CRÉDIT AGRICOLE",
    "CHINA SECURITIES DEPOSITORY",
    "HKSCC NOMINEES",
    "HANG SENG BANK",
    "CMB WING LUNG",
    "PUBLIC BANK (HONG KONG)",
    "THE BANK OF EAST ASIA",
    "MERRILL LYNCH",
)

RETAIL_NEEDLES = (
    "FUTU",
    "BRIGHT SMART",
    "PHILLIP SECURITIES",
    "INTERACTIVE BROKERS",
    "TIGER BROKERS",
    "TIGER SECURITIES",
    "WEBULL",
    "USMART",
    "YING LI",
    "CHIEF SECURITIES",
    "CELESTIAL",
    "EMPEROR SECURITIES",
    "GET NICE",
    "KINGSTON SECURITIES",
    "QUAM SECURITIES",
    "TANRICH",
    "VALUABLE CAPITAL",
    "UOB KAY HIAN",
    "CORE PACIFIC",
    "SUN HUNG KAI",
    "YUANTA",
    "KGI ",
)

ROW_RE = re.compile(
    r'class="col-participant-id".*?class="mobile-list-body">\s*([^<]+)\s*</div>'
    r'.*?class="col-participant-name".*?class="mobile-list-body">\s*([^<]+)\s*</div>'
    r'.*?class="col-shareholding text-right".*?class="mobile-list-body">\s*([^<]+)\s*</div>'
    r'.*?class="col-shareholding-percent text-right".*?class="mobile-list-body">\s*([^<]+)\s*</div>',
    re.S,
)


@dataclass(frozen=True)
class CcassRow:
    participant_id: str
    name: str
    shares: float
    pct: float
    bucket: str


def hk_stock_code(ticker: str) -> str:
    raw = ticker.strip().upper().replace(".HK", "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        raise ValueError(f"Not an HK stock code: {ticker}")
    return digits.zfill(5)


def classify(name: str) -> str:
    upper = name.upper()
    if "CITIC" in upper and "CITIBANK" not in upper and "CITIGROUP" not in upper:
        return "other"
    if any(needle in upper for needle in INST_NEEDLES):
        return "institutional"
    if any(needle in upper for needle in RETAIL_NEEDLES):
        return "retail"
    return "other"


def parse_rows(html: str) -> list[CcassRow]:
    rows: list[CcassRow] = []
    for match in ROW_RE.finditer(html):
        pid, name, shares_raw, pct_raw = (part.strip() for part in match.groups())
        shares = float(shares_raw.replace(",", "") or 0)
        pct = float(pct_raw.replace("%", "").replace(",", "") or 0)
        rows.append(CcassRow(pid, name, shares, pct, classify(name)))
    return rows


def parse_shareholding_date(html: str) -> date | None:
    match = re.search(
        r'name="txtShareholdingDate"[^>]*value="(\d{4}/\d{2}/\d{2})"',
        html,
    ) or re.search(
        r'id="txtShareholdingDate"[^>]*value="(\d{4}/\d{2}/\d{2})"',
        html,
    )
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y/%m/%d").date()


def _inputs(html: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for tag in re.finditer(r"<input\b([^>]*)>", html, re.I):
        attrs = tag.group(1)
        name = re.search(r'\bname="([^"]+)"', attrs)
        if not name:
            continue
        value = re.search(r'\bvalue="([^"]*)"', attrs)
        fields[name.group(1)] = value.group(1) if value else ""
    return fields


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return session


def fetch_ccass(stock_code: str, as_of: date | None = None, session: requests.Session | None = None) -> tuple[date, list[CcassRow]]:
    own = session or _session()
    page = own.get(SEARCH_URL, timeout=45)
    page.raise_for_status()
    fields = _inputs(page.text)
    default_date = parse_shareholding_date(page.text)
    use_date = as_of or default_date or date.today()
    payload = {
        **fields,
        "__EVENTTARGET": "btnSearch",
        "__EVENTARGUMENT": "",
        "txtShareholdingDate": use_date.strftime("%Y/%m/%d"),
        "txtStockCode": stock_code,
        "txtStockName": "",
        "txtParticipantID": "",
        "txtParticipantName": "",
        "txtSelPartID": "",
        "sortBy": fields.get("sortBy") or "shareholding",
        "sortDirection": fields.get("sortDirection") or "desc",
    }
    result = own.post(
        SEARCH_URL,
        data=payload,
        timeout=45,
        headers={"Referer": SEARCH_URL, "Origin": "https://www3.hkexnews.hk"},
    )
    result.raise_for_status()
    rows = parse_rows(result.text)
    actual = parse_shareholding_date(result.text) or use_date
    return actual, rows


def _business_days_back(start: date, days: int) -> date:
    cursor = start
    stepped = 0
    while stepped < days:
        cursor -= timedelta(days=1)
        if cursor.weekday() < 5:
            stepped += 1
    return cursor


def fetch_with_lookback(stock_code: str, lookback_days: int = 21) -> tuple[date, list[CcassRow], date | None, list[CcassRow]]:
    session = _session()
    as_of, latest = fetch_ccass(stock_code, session=session)
    if not latest:
        return as_of, [], None, []
    prior_date = _business_days_back(as_of, lookback_days)
    prior_rows: list[CcassRow] = []
    found: date | None = None
    for offset in range(0, 4):
        trial = prior_date - timedelta(days=offset)
        if trial.weekday() >= 5:
            continue
        try:
            found, prior_rows = fetch_ccass(stock_code, trial, session=session)
        except requests.RequestException:
            continue
        if prior_rows:
            break
    return as_of, latest, found if prior_rows else None, prior_rows


def bucket_pct(rows: Iterable[CcassRow], bucket: str) -> float:
    return round(sum(row.pct for row in rows if row.bucket == bucket), 2)


def flow_tables(latest: list[CcassRow], prior: list[CcassRow]) -> tuple[list[dict], list[dict]]:
    old = {row.name: row.pct for row in prior}
    deltas = []
    for row in latest:
        delta = row.pct - old.get(row.name, 0.0)
        if abs(delta) < 0.01:
            continue
        deltas.append((row.name, delta))
    deltas.sort(key=lambda item: item[1], reverse=True)
    buyers = [{"name": name, "change_30d": f"{delta:+.2f}%"} for name, delta in deltas if delta > 0][:5]
    sellers = [{"name": name, "change_30d": f"{delta:+.2f}%"} for name, delta in reversed(deltas) if delta < 0][:5]
    return buyers, sellers


def signal_for(inst_now: float, retail_now: float, inst_then: float | None, retail_then: float | None) -> str:
    if inst_then is None or retail_then is None:
        return "NEUTRAL"
    inst_delta = inst_now - inst_then
    retail_delta = retail_now - retail_then
    if inst_delta >= 0.15 and inst_delta > retail_delta:
        return "INSTITUTIONAL_ACCUMULATION"
    if retail_delta >= 0.15 and retail_delta > inst_delta:
        return "RETAIL_TRAP"
    return "NEUTRAL"


def build_hk_payload(ticker: str) -> dict:
    code = hk_stock_code(ticker)
    as_of, latest, prior_date, prior = fetch_with_lookback(code)
    inst = bucket_pct(latest, "institutional")
    retail = bucket_pct(latest, "retail")
    inst_then = bucket_pct(prior, "institutional") if prior else None
    retail_then = bucket_pct(prior, "retail") if prior else None
    buyers, sellers = flow_tables(latest, prior) if prior else ([], [])
    if not buyers and not sellers and latest:
        ranked = sorted(latest, key=lambda row: row.pct, reverse=True)[:5]
        buyers = [{"name": row.name, "change_30d": f"{row.pct:.2f}% held"} for row in ranked]
    return {
        "ticker": ticker.upper(),
        "as_of_date": as_of.isoformat(),
        "market_type": "HK",
        "institutional_pct": inst,
        "retail_pct": retail,
        "top_buyers": buyers,
        "top_sellers": sellers,
        "signal_type": signal_for(inst, retail, inst_then, retail_then),
    }
