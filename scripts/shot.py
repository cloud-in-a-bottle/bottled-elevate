"""Screenshot a page of the running app (dev helper).

    uv run --with playwright==1.62.0 python scripts/shot.py 'http://localhost:8080/#/activities' out.png [--wait-ms 1500] [--width 1400] [--height 1000]

Prints browser console errors so broken pages are obvious.
"""

import argparse

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("out")
parser.add_argument("--wait-ms", type=int, default=1500)
parser.add_argument("--width", type=int, default=1400)
parser.add_argument("--height", type=int, default=1000)
parser.add_argument("--light", action="store_true", help="use the light theme")
parser.add_argument("--dark", action="store_true", help="use the dark theme")
args = parser.parse_args()

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": args.width, "height": args.height})
    if args.light or args.dark:
        page.add_init_script(f"localStorage.setItem('elevate.theme', '{'dark' if args.dark else 'light'}')")
    errors: list[str] = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(args.url)
    page.wait_for_timeout(args.wait_ms)
    page.screenshot(path=args.out, full_page=True)
    browser.close()
    for e in errors:
        print(e)
    print(f"saved {args.out}")
