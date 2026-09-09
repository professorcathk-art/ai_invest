#!/usr/bin/env python3
"""Write InvestMouse launchd plists for the always-on iMac."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts/run_ownership_sync.sh"
SHORTSELL = ROOT / "scripts/run_shortsell_sync.sh"
FEEDS = ROOT / "scripts/sync_public_feeds.sh"
WARM = ROOT / "scripts/warm_books.sh"
DIGEST = ROOT / "scripts/run_industry_digest.sh"
OUT = ROOT / "scripts/launchd"
LOG = Path("/Users/mickeylau/Library/Logs")


def weekday_clock(hour: int, minute: int) -> str:
    blocks = []
    for weekday in range(1, 6):
        blocks.append(
            f"""    <dict>
      <key>Weekday</key>
      <integer>{weekday}</integer>
      <key>Hour</key>
      <integer>{hour}</integer>
      <key>Minute</key>
      <integer>{minute}</integer>
    </dict>"""
        )
    return "\n".join(blocks)


def plist(
    label: str,
    args: list[str],
    log: str,
    *,
    calendar: str | None = None,
    interval: int | None = None,
    run_at_load: bool = False,
) -> str:
    arg_xml = "\n".join(f"      <string>{a}</string>" for a in args)
    schedule = ""
    if calendar:
        schedule = f"  <key>StartCalendarInterval</key>\n  <array>\n{calendar}\n  </array>\n"
    if interval:
        schedule += f"  <key>StartInterval</key>\n  <integer>{interval}</integer>\n"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>ProgramArguments</key>
  <array>
{arg_xml}
  </array>
  <key>WorkingDirectory</key>
  <string>{ROOT}</string>
{schedule}  <key>StandardOutPath</key>
  <string>{LOG / log}</string>
  <key>StandardErrorPath</key>
  <string>{LOG / log}</string>
  <key>RunAtLoad</key>
  <{str(run_at_load).lower()}/>
  <key>ProcessType</key>
  <string>Standard</string>
  <key>Nice</key>
  <integer>0</integer>
</dict>
</plist>
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {
        "com.investmouse.ccass-hk-1.plist": plist(
            "com.investmouse.ccass-hk-1",
            ["/bin/zsh", str(SCRIPT), "--market", "hk", "--shard", "1/3"],
            "investmouse-ccass-hk-1.log",
            calendar=weekday_clock(19, 0),
        ),
        "com.investmouse.ccass-hk-2.plist": plist(
            "com.investmouse.ccass-hk-2",
            ["/bin/zsh", str(SCRIPT), "--market", "hk", "--shard", "2/3"],
            "investmouse-ccass-hk-2.log",
            calendar=weekday_clock(19, 5),
        ),
        "com.investmouse.ccass-hk-3.plist": plist(
            "com.investmouse.ccass-hk-3",
            ["/bin/zsh", str(SCRIPT), "--market", "hk", "--shard", "3/3"],
            "investmouse-ccass-hk-3.log",
            calendar=weekday_clock(19, 10),
        ),
        "com.investmouse.ccass-retry.plist": plist(
            "com.investmouse.ccass-retry",
            ["/bin/zsh", str(SCRIPT), "--retry-failed"],
            "investmouse-ccass-retry.log",
            interval=10800,
        ),
        "com.investmouse.us-ownership.plist": plist(
            "com.investmouse.us-ownership",
            ["/bin/zsh", str(SCRIPT), "--market", "us"],
            "investmouse-us-ownership.log",
            calendar="\n".join(weekday_clock(h, 30) for h in (10, 16, 21)),
        ),
        "com.investmouse.public-feeds.plist": plist(
            "com.investmouse.public-feeds",
            ["/bin/zsh", str(FEEDS)],
            "investmouse-public-feeds.log",
            interval=3600,
            run_at_load=True,
        ),
        "com.investmouse.warm-books.plist": plist(
            "com.investmouse.warm-books",
            ["/bin/zsh", str(WARM)],
            "investmouse-warm-books.log",
            calendar=weekday_clock(7, 15),
        ),
        "com.investmouse.hkex-shortsell.plist": plist(
            "com.investmouse.hkex-shortsell",
            ["/bin/zsh", str(SHORTSELL)],
            "investmouse-hkex-shortsell.log",
            calendar="\n".join(
                [weekday_clock(12, 20), weekday_clock(16, 25), weekday_clock(17, 5)],
            ),
        ),
        "com.investmouse.industry-digest.plist": plist(
            "com.investmouse.industry-digest",
            ["/bin/zsh", str(DIGEST)],
            "investmouse-industry-digest.log",
            calendar=weekday_clock(6, 15),
        ),
    }
    for name, body in jobs.items():
        (OUT / name).write_text(body)
        print(f"wrote {OUT / name}")


if __name__ == "__main__":
    main()
