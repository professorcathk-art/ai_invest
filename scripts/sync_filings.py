#!/usr/bin/env python3
"""Download official annual reports into the company-filings bucket.

US: SEC EDGAR 10-K / 20-F / ARS. HK: HKEX title search (Annual Report).
PDFs never go through Vercel — the iMac uploads to Supabase Storage, then
upserts metadata. Optional POST /api/filings/ingest after the row is stored.

    python3 scripts/sync_filings.py
    python3 scripts/sync_filings.py NVDA 0700.HK
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
import sys
import time

logging.getLogger("pypdf").setLevel(logging.ERROR)
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests

ROOT = Path(__file__).resolve().parent.parent
LIST_FILE = Path(__file__).resolve().parent / "ownership_tickers.txt"
UA = "InvestMouse filings-sync/1.0 (https://ai-invest-dvxh.vercel.app; research cache)"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
HKEX_PREFIX = "https://www1.hkexnews.hk/search/prefix.do"
HKEX_SEARCH = "https://www1.hkexnews.hk/search/titleSearchServlet.do"
HKEX_HOST = "https://www1.hkexnews.hk"
EXCERPT_LIMIT = 12_000
MAX_BYTES = 50 * 1024 * 1024


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


def env(name: str) -> str:
    return os.getenv(name, "").strip()


SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
INGEST_TOKEN = env("RESEARCH_INGEST_TOKEN")
INGEST_URL = f"{public_origin()}/api/filings/ingest"


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": UA,
            "Accept": "application/json,text/html,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return s


def read_watchlist(extra: list[str]) -> list[str]:
    if extra:
        return [t.strip().upper() for t in extra if t.strip()]
    raw = env("OWNERSHIP_TICKERS")
    if raw:
        return [t.strip().upper() for t in raw.replace(",", " ").split() if t.strip()]
    if not LIST_FILE.is_file():
        return []
    return [
        line.strip().upper()
        for line in LIST_FILE.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def is_hk(ticker: str) -> bool:
    return ticker.upper().endswith(".HK")


def hk_code(ticker: str) -> str:
    return ticker.upper().replace(".HK", "").lstrip("0") or "0"


def hk_padded(ticker: str) -> str:
    return hk_code(ticker).zfill(5)


def storage_public_url(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/company-filings/{path}"


def rest_headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def existing_years(http: requests.Session, ticker: str) -> set[tuple[int, str]]:
    url = f"{SUPABASE_URL}/rest/v1/company_filings"
    r = http.get(
        url,
        headers=rest_headers(),
        params={"ticker": f"eq.{ticker}", "select": "fiscal_year,doc_type"},
        timeout=30,
    )
    if r.status_code != 200:
        print(f"  list existing {ticker} {r.status_code} {r.text[:160]}")
        return set()
    out: set[tuple[int, str]] = set()
    for row in r.json() or []:
        try:
            out.add((int(row["fiscal_year"]), str(row["doc_type"])))
        except (KeyError, TypeError, ValueError):
            continue
    return out


def upsert_row(http: requests.Session, row: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/company_filings"
    headers = {
        **rest_headers(),
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = http.post(url, headers=headers, json=row, timeout=60)
    if r.status_code not in (200, 201, 204):
        print(f"  upsert {row.get('ticker')} {r.status_code} {r.text[:200]}")
        return False
    if INGEST_TOKEN:
        try:
            ping = http.post(
                INGEST_URL,
                headers={
                    "Authorization": f"Bearer {INGEST_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "ticker": row["ticker"],
                    "fiscalYear": row["fiscal_year"],
                    "docType": row["doc_type"],
                    "title": row.get("title") or "",
                    "sourceUrl": row.get("source_url") or "",
                    "storagePath": row.get("storage_path") or "",
                    "publicUrl": row.get("public_url") or "",
                    "excerpt": row.get("excerpt") or "",
                    "bytes": row.get("bytes") or 0,
                },
                timeout=30,
            )
            if ping.status_code not in (200, 201):
                print(f"  ingest ping {row.get('ticker')} {ping.status_code}")
        except requests.RequestException as exc:
            print(f"  ingest ping failed: {exc}")
    return True


def upload_object(http: requests.Session, path: str, blob: bytes, content_type: str) -> bool:
    url = f"{SUPABASE_URL}/storage/v1/object/company-filings/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    r = http.post(url, headers=headers, data=blob, timeout=180)
    if r.status_code in (200, 201):
        return True
    print(f"  upload {path} {r.status_code} {r.text[:200]}")
    return False


def strip_html(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def excerpt_from_html(raw: str) -> str:
    text = strip_html(raw)
    lower = text.lower()
    start = -1
    for needle in ("item 1. business", "item 1 – business", "item 1- business", "business overview"):
        start = lower.find(needle)
        if start >= 0:
            break
    if start >= 0:
        text = text[start:]
    return text[:EXCERPT_LIMIT]


def excerpt_from_pdf(blob: bytes) -> str:
    try:
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(blob))
        parts: list[str] = []
        for page in reader.pages[:20]:
            parts.append(page.extract_text() or "")
        return re.sub(r"\s+", " ", " ".join(parts)).strip()[:EXCERPT_LIMIT]
    except Exception:
        return ""


def excerpt_for(blob: bytes, content_type: str, raw_text: str | None = None) -> str:
    if raw_text:
        return excerpt_from_html(raw_text) if "html" in content_type else raw_text[:EXCERPT_LIMIT]
    if "pdf" in content_type:
        return excerpt_from_pdf(blob)
    try:
        return excerpt_from_html(blob.decode("utf-8", errors="ignore"))
    except Exception:
        return ""


# --- SEC -------------------------------------------------------------------

_TICKER_CIK: dict[str, str] | None = None


def sec_cik_map(http: requests.Session) -> dict[str, str]:
    global _TICKER_CIK
    if _TICKER_CIK is not None:
        return _TICKER_CIK
    r = http.get(SEC_TICKERS_URL, timeout=45)
    r.raise_for_status()
    mapping: dict[str, str] = {}
    for row in r.json().values():
        ticker = str(row.get("ticker") or "").upper()
        cik = str(row.get("cik_str") or "").zfill(10)
        if ticker and cik != "0000000000":
            mapping[ticker] = cik
    _TICKER_CIK = mapping
    time.sleep(0.4)
    return mapping


def sec_pick_filing(forms: list[str], dates: list[str], accessions: list[str], docs: list[str]) -> dict | None:
    wanted = ("10-K", "20-F", "ARS")
    best = None
    for form, date, acc, doc in zip(forms, dates, accessions, docs):
        if form not in wanted:
            continue
        year = int(str(date)[:4]) if str(date)[:4].isdigit() else 0
        if year < 2018:
            continue
        rank = wanted.index(form)
        cand = {"form": form, "date": date, "accession": acc, "doc": doc, "year": year, "rank": rank}
        if best is None or cand["year"] > best["year"] or (cand["year"] == best["year"] and cand["rank"] < best["rank"]):
            best = cand
    return best


def sec_index_pdf(http: requests.Session, cik: str, accession: str) -> str | None:
    nodash = accession.replace("-", "")
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{nodash}/index.json"
    try:
        r = http.get(url, timeout=45)
        time.sleep(0.4)
        if r.status_code != 200:
            return None
        items = (r.json().get("directory") or {}).get("item") or []
        pdfs = [it.get("name") for it in items if str(it.get("name", "")).lower().endswith(".pdf")]
        for name in pdfs:
            lower = name.lower()
            if any(tok in lower for tok in ("10-k", "10k", "20-f", "20f", "annual")):
                return name
        return pdfs[0] if pdfs else None
    except Exception:
        return None


def find_sec(http: requests.Session, ticker: str) -> dict | None:
    cik = sec_cik_map(http).get(ticker.upper())
    if not cik:
        print(f"  no SEC CIK for {ticker}")
        return None
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    r = http.get(url, timeout=45)
    time.sleep(0.4)
    if r.status_code != 200:
        print(f"  SEC submissions {ticker} {r.status_code}")
        return None
    recent = (r.json().get("filings") or {}).get("recent") or {}
    picked = sec_pick_filing(
        recent.get("form") or [],
        recent.get("filingDate") or [],
        recent.get("accessionNumber") or [],
        recent.get("primaryDocument") or [],
    )
    if not picked:
        return None
    nodash = picked["accession"].replace("-", "")
    base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{nodash}/"
    pdf_name = sec_index_pdf(http, cik, picked["accession"])
    filename = pdf_name or picked["doc"]
    source = urljoin(base, filename)
    doc_type = "10-k" if picked["form"] == "10-K" else "20-f" if picked["form"] == "20-F" else "annual_report"
    return {
        "year": picked["year"],
        "doc_type": doc_type,
        "title": f"{picked['year']} {picked['form']}",
        "source_url": source,
        "filename": filename,
    }


# --- HKEX ------------------------------------------------------------------

def hkex_stock_id(http: requests.Session, ticker: str) -> str | None:
    code = hk_padded(ticker)
    r = http.get(
        HKEX_PREFIX,
        params={"callback": "callback", "lang": "EN", "type": "A", "name": code},
        timeout=45,
        headers={"Referer": "https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=en"},
    )
    time.sleep(0.8)
    if r.status_code != 200:
        print(f"  HKEX prefix {ticker} {r.status_code}")
        return None
    body = r.text
    start, end = body.find("{"), body.rfind("}")
    raw = body[start : end + 1] if start >= 0 and end > start else body
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(f"  HKEX prefix parse fail {ticker} {body[:120]!r}")
        return None
    table = data.get("stockInfo") or data.get("tableData") or data.get("data") or data
    rows = table if isinstance(table, list) else []
    if isinstance(table, dict):
        rows = table.get("stockInfo") or table.get("data") or []
    best = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        stock_code = str(row.get("stockCode") or row.get("code") or row.get("c") or "")
        stock_id = str(row.get("stockId") or row.get("id") or row.get("i") or "")
        if not stock_id:
            continue
        digits = re.sub(r"\D", "", stock_code)
        if digits.lstrip("0") == hk_code(ticker) or digits == code:
            return stock_id
        if best is None:
            best = stock_id
    return best


def hkex_parse_results(payload: object) -> list[dict]:
    if isinstance(payload, dict) and isinstance(payload.get("result"), str):
        try:
            payload = json.loads(payload["result"])
        except json.JSONDecodeError:
            payload = payload["result"]
    if isinstance(payload, dict):
        payload = payload.get("result") or payload.get("list") or payload.get("data") or []
    if not isinstance(payload, list):
        return []
    out = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        link = (
            row.get("fileLink")
            or row.get("FILE_LINK")
            or row.get("webPath")
            or row.get("link")
            or ""
        )
        title = str(row.get("title") or row.get("TITLE") or row.get("newsTitle") or "Annual Report")
        date = str(row.get("dateTime") or row.get("DATE_TIME") or row.get("releaseDate") or "")
        if not link:
            continue
        out.append({"link": str(link), "title": title, "date": date})
    return out


def find_hkex(http: requests.Session, ticker: str) -> dict | None:
    stock_id = hkex_stock_id(http, ticker)
    if not stock_id:
        print(f"  no HKEX stockId for {ticker}")
        return None
    today = datetime.now(timezone.utc)
    form = {
        "sortDir": "0",
        "sortByOptions": "DateTime",
        "category": "0",
        "market": "SEHK",
        "stockId": str(stock_id),
        "documentType": "-1",
        "fromDate": (today.replace(year=today.year - 4)).strftime("%Y%m%d"),
        "toDate": today.strftime("%Y%m%d"),
        "title": "",
        "searchType": "0",
        "t1code": "40000",
        "t2Gcode": "-2",
        "t2code": "40100",
        "rowRange": "20",
        "lang": "EN",
    }
    r = http.get(
        HKEX_SEARCH,
        params=form,
        timeout=45,
        headers={
            "Referer": "https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=en",
        },
    )
    time.sleep(0.8)
    if r.status_code != 200:
        print(f"  HKEX search {ticker} {r.status_code}")
        return None
    try:
        payload = r.json()
    except ValueError:
        payload = r.text
    rows = hkex_parse_results(payload)
    if not rows:
        print(f"  HKEX no annual rows for {ticker}")
        return None
    row = rows[0]
    link = row["link"]
    if link.startswith("//"):
        source = "https:" + link
    elif link.startswith("http"):
        source = link
    else:
        source = urljoin(HKEX_HOST, link if link.startswith("/") else "/" + link)
    year = 0
    m = re.search(r"(20\d{2})", row["title"] + " " + row["date"] + " " + link)
    if m:
        year = int(m.group(1))
    if year < 2018:
        year = today.year - 1
    return {
        "year": year,
        "doc_type": "annual_report",
        "title": row["title"][:180] or f"{year} Annual Report",
        "source_url": source,
        "filename": Path(link.split("?")[0]).name or f"{year}-annual_report.pdf",
    }


def download(http: requests.Session, url: str) -> tuple[bytes, str] | None:
    headers = {"Referer": url}
    r = http.get(url, timeout=120, headers=headers, stream=True)
    if r.status_code != 200:
        print(f"  download {r.status_code} {url[:80]}")
        return None
    blob = r.content
    if not blob or len(blob) < 800:
        print(f"  empty download {url[:80]}")
        return None
    if len(blob) > MAX_BYTES:
        print(f"  skip oversized {len(blob)} {url[:80]}")
        return None
    ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if "pdf" in ctype or url.lower().endswith(".pdf") or blob[:4] == b"%PDF":
        return blob, "application/pdf"
    if "html" in ctype or url.lower().endswith((".htm", ".html")):
        return blob, "text/html"
    if blob[:4] == b"%PDF":
        return blob, "application/pdf"
    return blob, ctype or "application/octet-stream"


def ext_for(content_type: str, filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf") or content_type == "application/pdf":
        return "pdf"
    if lower.endswith(".html"):
        return "html"
    if lower.endswith(".htm") or "html" in content_type:
        return "htm"
    return "bin"


def persist(http: requests.Session, ticker: str, found: dict) -> bool:
    got = download(http, found["source_url"])
    if not got:
        return False
    blob, content_type = got
    ext = ext_for(content_type, found.get("filename") or "")
    path = f"{ticker}/{found['year']}-{found['doc_type']}.{ext}"
    if not upload_object(http, path, blob, content_type):
        return False
    excerpt = excerpt_for(blob, content_type)
    row = {
        "ticker": ticker,
        "fiscal_year": found["year"],
        "doc_type": found["doc_type"],
        "title": found["title"],
        "source_url": found["source_url"],
        "storage_path": path,
        "public_url": storage_public_url(path),
        "excerpt": excerpt,
        "bytes": len(blob),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    if not upsert_row(http, row):
        return False
    print(f"  stored {ticker} {found['year']} {found['doc_type']} {len(blob)}b excerpt={len(excerpt)}")
    return True


def sync_one(http: requests.Session, ticker: str) -> str:
    have = existing_years(http, ticker)
    found = find_hkex(http, ticker) if is_hk(ticker) else find_sec(http, ticker)
    if not found:
        return "miss"
    key = (int(found["year"]), found["doc_type"])
    if key in have:
        print(f"  skip {ticker} {key[0]} {key[1]} already stored")
        return "skip"
    return "ok" if persist(http, ticker, found) else "fail"


def main() -> int:
    if not SUPABASE_URL or not SERVICE_KEY:
        print("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", file=sys.stderr)
        return 2
    tickers = read_watchlist(sys.argv[1:])
    if not tickers:
        print("no tickers", file=sys.stderr)
        return 2
    http = session()
    print(f"[{datetime.now(timezone.utc).isoformat()}] filings sync {len(tickers)} names via {SUPABASE_URL}")
    counts = {"ok": 0, "skip": 0, "miss": 0, "fail": 0}
    for i, ticker in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {ticker}")
        try:
            counts[sync_one(http, ticker)] += 1
        except Exception as exc:
            print(f"  error {ticker}: {exc}")
            counts["fail"] += 1
    print(f"done {counts}")
    return 0 if counts["fail"] == 0 or counts["ok"] > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
