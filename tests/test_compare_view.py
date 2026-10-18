import os
from pathlib import Path

from playwright.sync_api import expect
from playwright.sync_api import sync_playwright

# Set ELEVATE_TEST_SHOTS_DIR to also capture screenshots of each step.
_SHOTS_DIR = os.environ.get("ELEVATE_TEST_SHOTS_DIR")

# Plotly traces of the stacked compare graph, grouped by y axis (one axis per sensor row).
_TRACES_PER_ROW = """(sel) => {
  const gd = document.querySelector(sel);
  const rows = {};
  for (const t of gd.data || []) rows[t.yaxis || 'y'] = (rows[t.yaxis || 'y'] || 0) + 1;
  return Object.values(rows);
}"""
# Every trace's y values, to detect a re-render with different (eg smoothed) data.
_ALL_Y = "(sel) => document.querySelector(sel).data.map(t => (t.y || []).join()).join('|')"


def _shot(page, name: str, locator=None) -> None:
    if not _SHOTS_DIR:
        return
    Path(_SHOTS_DIR).mkdir(parents=True, exist_ok=True)
    if locator is None:
        page.screenshot(path=f"{_SHOTS_DIR}/{name}.png", full_page=True)
    else:
        locator.screenshot(path=f"{_SHOTS_DIR}/{name}.png")


def test_compare_view(stack):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 1100})
        try:
            _run(stack, page)
        except Exception:
            _shot(page, "99-failure")
            raise
        finally:
            browser.close()


def _run(stack, page):
    stack.playwright_login(page)
    page.goto(stack.url)

    # The app auto-starts the initial sync; the backend imports the 3 mock workouts.
    rows = page.locator("table.act-table tbody tr")
    expect(rows).to_have_count(3, timeout=120000)
    _shot(page, "01-activities")

    # Tick all compare checkboxes; the compare bar appears.
    for i in range(3):
        rows.nth(i).locator(".act-col-check input").check()
    expect(page.locator(".act-compare-bar")).to_contain_text("3 selected")
    _shot(page, "02-selected")

    page.locator(".act-compare-bar button", has_text="Compare").click()
    page.wait_for_selector(".compare-page", timeout=30000)
    assert "/activity/compare/" in page.url

    # Header legend: one colored chip per workout, and the overlaid map.
    expect(page.locator(".workout-chip")).to_have_count(3, timeout=30000)
    expect(page.locator(".compare-map")).to_have_count(1)

    # Stacked analysis graph: one row per sensor, workouts overlaid as traces.
    graph = ".compare-graph.js-plotly-plot"
    page.wait_for_selector(graph, timeout=30000)
    per_row = page.evaluate(_TRACES_PER_ROW, graph)
    assert len(per_row) >= 3  # at least elevation + pace/speed + heart rate
    # All 3 workouts share elevation + HR streams, so some row overlays 3 traces...
    assert max(per_row) == 3
    # ...and the ride is alone on the power row.
    assert 1 in per_row
    _shot(page, "03-compare-graphs", page.locator(".graphs-stack"))

    # Stats tab (default): mini per-stat charts, grouped like the classic stats page.
    page.wait_for_selector(".compare-stat-chart .js-plotly-plot", timeout=30000)
    assert page.locator(".compare-stat-chart").count() >= 5
    _shot(page, "04-compare-stats", page.locator(".stat-display-group").first)

    # Peaks tab: overlaid peaks curves per sensor; heart rate peaks exist for all 3 workouts.
    page.locator(".tab", has_text="Peaks").click()
    page.wait_for_selector(".compare-peak-chart .js-plotly-plot", timeout=30000)
    assert page.locator(".compare-peak-chart").count() >= 2
    peak_traces = page.evaluate(
        """() => Math.max(...Array.from(
                 document.querySelectorAll('.compare-peak-chart .js-plotly-plot')
               ).map(el => (el.data || []).length))"""
    )
    assert peak_traces == 3
    _shot(page, "05-compare-peaks")

    # Scale toggle re-renders the stack on the time axis.
    page.locator(".scale-toggle button", has_text="Time").click()
    expect(page.locator(".scale-toggle button.active")).to_have_text("Time")
    page.wait_for_selector(graph, timeout=30000)
    _shot(page, "06-compare-time-scale")

    # Smoothing re-renders the stack with a 30s centered moving average.
    raw_y = page.evaluate(_ALL_Y, graph)
    page.locator(".smoothing-toggle button", has_text="30s").click()
    page.wait_for_function(f"(raw) => ({_ALL_Y})('{graph}') !== raw", arg=raw_y, timeout=30000)
    _shot(page, "07-compare-smoothed", page.locator(".graphs-stack"))

    # Detail view: the analysis graph has the same smoothing control.
    page.goto(f"{stack.url}/#/activities")
    expect(rows).to_have_count(3, timeout=30000)
    rows.first.dblclick()
    detail_graph = ".analysis-graph .js-plotly-plot"
    page.wait_for_selector(detail_graph, timeout=30000)
    detail_raw_y = page.evaluate(_ALL_Y, detail_graph)
    page.locator(".analysis-graph .smoothing-toggle button", has_text="2m").click()
    page.wait_for_function(f"(raw) => ({_ALL_Y})('{detail_graph}') !== raw", arg=detail_raw_y, timeout=30000)
    _shot(page, "08-detail-smoothed", page.locator(".analysis-graph"))
