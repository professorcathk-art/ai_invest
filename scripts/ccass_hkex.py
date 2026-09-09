"""Official HKEX CCASS Shareholding Search — one shared session, one POST per name.

https://www3.hkexnews.hk/sdw/search/searchsdw.aspx

HKEX is an ASP.NET postback (not a public JSON API). The slow/hangy behaviour came from:
starting a new Python process + GET of the search form for every ticker, then up to five
extra date lookups. This client opens the form once, reuses ViewState, and scrapes
today's table with BeautifulSoup.
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

import requests
from bs4 import BeautifulSoup

SEARCH_URL = "https://www3.hkexnews.hk/sdw/search/searchsdw.aspx"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
CONNECT_TIMEOUT = float(os.getenv("CCASS_CONNECT_TIMEOUT", "8"))
READ_TIMEOUT = float(os.getenv("CCASS_READ_TIMEOUT", "22"))
TIMEOUT = (CONNECT_TIMEOUT, READ_TIMEOUT)
RETRIES = int(os.getenv("CCASS_RETRIES", "2"))
GAP_SEC = float(os.getenv("CCASS_GAP_SEC", "0.35"))

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


def _texts(soup: BeautifulSoup, selector: str) -> list[str]:
    return [el.get_text(" ", strip=True) for el in soup.select(selector)]


def parse_rows(html: str) -> list[CcassRow]:
    soup = BeautifulSoup(html, "html.parser")
    pids = _texts(soup, ".col-participant-id .mobile-list-body")
    names = _texts(soup, ".col-participant-name .mobile-list-body")
    shares_raw = _texts(soup, ".col-shareholding.text-right .mobile-list-body")
    pcts_raw = _texts(soup, ".col-shareholding-percent .mobile-list-body")
    n = min(len(pids), len(names), len(shares_raw), len(pcts_raw))
    if n == 0:
        return _parse_rows_regex(html)
    rows: list[CcassRow] = []
    for i in range(n):
        shares = float(shares_raw[i].replace(",", "") or 0)
        pct = float(pcts_raw[i].replace("%", "").replace(",", "") or 0)
        rows.append(CcassRow(pids[i], names[i], shares, pct, classify(names[i])))
    return rows


def _parse_rows_regex(html: str) -> list[CcassRow]:
    rows: list[CcassRow] = []
    for match in ROW_RE.finditer(html):
        pid, name, shares_raw, pct_raw = (part.strip() for part in match.groups())
        shares = float(shares_raw.replace(",", "") or 0)
        pct = float(pct_raw.replace("%", "").replace(",", "") or 0)
        rows.append(CcassRow(pid, name, shares, pct, classify(name)))
    return rows


def hidden_inputs(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    fields: dict[str, str] = {}
    for tag in soup.find_all("input"):
        name = tag.get("name")
        if not name:
            continue
        fields[str(name)] = str(tag.get("value") or "")
    return fields


def parse_shareholding_date(html: str) -> date | None:
    fields = hidden_inputs(html)
    raw = fields.get("txtShareholdingDate") or ""
    if not raw:
        match = re.search(r'name="txtShareholdingDate"[^>]*value="(\d{4}/\d{2}/\d{2})"', html)
        raw = match.group(1) if match else ""
    if not re.match(r"\d{4}/\d{2}/\d{2}", raw):
        return None
    return datetime.strptime(raw[:10], "%Y/%m/%d").date()


class HkexCcassClient:
    """One TCP session + one ASP.NET ViewState for the whole watchlist."""

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        self.fields: dict[str, str] = {}
        self.market_date: date | None = None

    def open(self) -> date | None:
        html = self._call("GET")
        self._refresh(html)
        return self.market_date

    def search(self, stock_code: str, as_of: date | None = None) -> tuple[date, list[CcassRow]]:
        if not self.fields:
            self.open()
        use_date = as_of or self.market_date or date.today()
        payload = {
            **self.fields,
            "__EVENTTARGET": "btnSearch",
            "__EVENTARGUMENT": "",
            "txtShareholdingDate": use_date.strftime("%Y/%m/%d"),
            "txtStockCode": stock_code,
            "txtStockName": "",
            "txtParticipantID": "",
            "txtParticipantName": "",
            "txtSelPartID": "",
            "sortBy": self.fields.get("sortBy") or "shareholding",
            "sortDirection": self.fields.get("sortDirection") or "desc",
        }
        html = self._call("POST", payload)
        self._refresh(html)
        rows = parse_rows(html)
        actual = parse_shareholding_date(html) or use_date
        if as_of is None:
            self.market_date = actual
        return actual, rows

    def _refresh(self, html: str) -> None:
        self.fields = hidden_inputs(html)
        parsed = parse_shareholding_date(html)
        if parsed and self.market_date is None:
            self.market_date = parsed

    def _call(self, method: str, data: dict[str, str] | None = None) -> str:
        last: Exception | None = None
        for attempt in range(RETRIES + 1):
            try:
                if method == "GET":
                    res = self.session.get(SEARCH_URL, timeout=TIMEOUT)
                else:
                    res = self.session.post(
                        SEARCH_URL,
                        data=data,
                        timeout=TIMEOUT,
                        headers={"Referer": SEARCH_URL, "Origin": "https://www3.hkexnews.hk"},
                    )
                res.raise_for_status()
                if len(res.text) < 200:
                    raise RuntimeError("HKEX returned an empty page")
                return res.text
            except (requests.RequestException, RuntimeError) as exc:
                last = exc
                time.sleep(1.2 * (attempt + 1))
        raise last or RuntimeError("HKEX request failed")


def fetch_ccass(
    stock_code: str,
    as_of: date | None = None,
    session: requests.Session | None = None,
    client: HkexCcassClient | None = None,
) -> tuple[date, list[CcassRow]]:
    own = client or HkexCcassClient()
    if session is not None:
        own.session = session
    if not own.fields:
        own.open()
    return own.search(stock_code, as_of)


def _business_days_back(start: date, days: int) -> date:
    cursor = start
    stepped = 0
    while stepped < days:
        cursor -= timedelta(days=1)
        if cursor.weekday() < 5:
            stepped += 1
    return cursor


def fetch_with_lookback(
    stock_code: str,
    lookback_days: int = 21,
    client: HkexCcassClient | None = None,
) -> tuple[date, list[CcassRow], date | None, list[CcassRow]]:
    own = client or HkexCcassClient()
    if not own.fields:
        own.open()
    as_of, latest = own.search(stock_code)
    if not latest:
        return as_of, [], None, []
    want_lookback = os.getenv("CCASS_LOOKBACK", "").strip().lower() in {"1", "true", "yes"}
    if not want_lookback:
        return as_of, latest, None, []
    prior_date = _business_days_back(as_of, lookback_days)
    try:
        found, prior_rows = own.search(stock_code, prior_date)
    except (requests.RequestException, RuntimeError):
        return as_of, latest, None, []
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


def build_hk_payload(ticker: str, client: HkexCcassClient | None = None) -> dict:
    code = hk_stock_code(ticker)
    as_of, latest, _prior_date, prior = fetch_with_lookback(code, client=client)
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
