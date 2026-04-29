"""
End-to-end Playwright smoke tests for Y/T_TRANSCRIPT.

Run:
    pip install pytest-playwright
    playwright install chromium
    pytest tests/e2e/test_e2e_smoke.py -v

Configurable via env:
    BASE_URL   default: read from /app/frontend/.env REACT_APP_BACKEND_URL
"""
import os
import re
import time
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect


def _base_url() -> str:
    if os.environ.get("BASE_URL"):
        return os.environ["BASE_URL"].rstrip("/")
    env = Path("/app/frontend/.env").read_text(encoding="utf-8")
    m = re.search(r"REACT_APP_BACKEND_URL=(\S+)", env)
    if not m:
        raise RuntimeError("REACT_APP_BACKEND_URL not found")
    return m.group(1).rstrip("/")


BASE_URL = _base_url()


@pytest.fixture(autouse=True)
def viewport(page: Page):
    page.set_viewport_size({"width": 1920, "height": 800})
    yield


# ---------- Console-error capture --------------------------------------------
@pytest.fixture
def console_errors(page: Page):
    errors: list[str] = []
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on(
        "console",
        lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None,
    )
    return errors


# ---------- Tests ------------------------------------------------------------
def test_hero_renders(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    expect(page.get_by_test_id("brand-logo")).to_be_visible()
    expect(page.get_by_test_id("url-input-field")).to_be_visible()
    expect(page.get_by_test_id("extract-submit-btn")).to_be_visible()
    # Demo links present
    expect(page.get_by_test_id("demo-first-youtube-video")).to_be_visible()


def test_extract_demo_first_video(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    page.get_by_test_id("demo-first-youtube-video").click()
    # Wait for transcript viewer to appear
    expect(page.get_by_test_id("transcript-viewer")).to_be_visible(timeout=20_000)
    expect(page.get_by_test_id("video-title")).to_contain_text("Me at the zoo")
    # At least 3 transcript line elements
    page.wait_for_timeout(500)
    lines = page.locator("[data-testid^='transcript-line-']")
    assert lines.count() >= 3


def test_tabs_switch(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    page.get_by_test_id("demo-first-youtube-video").click()
    expect(page.get_by_test_id("transcript-viewer")).to_be_visible(timeout=20_000)
    page.get_by_test_id("tab-summary").click()
    expect(page.get_by_test_id("generate-summary-btn")).to_be_visible()
    page.get_by_test_id("tab-translate").click()
    expect(page.get_by_test_id("translate-btn")).to_be_visible()
    page.get_by_test_id("tab-transcript").click()
    expect(page.locator("[data-testid^='transcript-line-']").first).to_be_visible()


def test_summarize_flow(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    page.get_by_test_id("demo-first-youtube-video").click()
    expect(page.get_by_test_id("transcript-viewer")).to_be_visible(timeout=20_000)
    page.get_by_test_id("tab-summary").click()
    page.get_by_test_id("generate-summary-btn").click()
    # Wait for TLDR to appear
    expect(page.get_by_test_id("summary-tldr")).to_be_visible(timeout=45_000)
    expect(page.get_by_test_id("summary-key-points").locator("li").first).to_be_visible()


def test_translate_flow(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    page.get_by_test_id("demo-first-youtube-video").click()
    expect(page.get_by_test_id("transcript-viewer")).to_be_visible(timeout=20_000)
    page.get_by_test_id("tab-translate").click()
    page.get_by_test_id("translate-language-select").select_option(value="Spanish")
    page.get_by_test_id("translate-btn").click()
    expect(page.get_by_test_id("translate-output")).to_be_visible(timeout=45_000)
    out = page.get_by_test_id("translate-output").inner_text()
    assert len(out) > 5


def test_pricing_and_tools(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    expect(page.get_by_test_id("pricing-card-free")).to_be_visible()
    expect(page.get_by_test_id("pricing-card-pro")).to_be_visible()
    expect(page.get_by_test_id("pricing-card-enterprise")).to_be_visible()
    tools = page.locator("[data-testid^='tool-card-']")
    assert tools.count() == 9


def test_footer_cta(page: Page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    cta = page.get_by_test_id("footer-cta")
    expect(cta).to_be_visible()
    expect(cta).to_contain_text("START EXTRACTING")


def test_no_console_errors_during_full_flow(page: Page, console_errors):
    page.goto(BASE_URL, wait_until="networkidle", timeout=30_000)
    page.get_by_test_id("demo-first-youtube-video").click()
    page.wait_for_timeout(4_000)
    page.get_by_test_id("tab-summary").click()
    page.wait_for_timeout(500)
    page.get_by_test_id("tab-translate").click()
    page.wait_for_timeout(500)
    page.get_by_test_id("tab-transcript").click()
    page.wait_for_timeout(500)
    page.get_by_test_id("copy-all-btn").click()
    page.wait_for_timeout(500)
    # Filter out 3rd-party noise (YouTube iframe, font 404, etc.)
    relevant = [
        e for e in console_errors
        if not any(skip in e.lower() for skip in [
            "youtube.com",
            "googlevideo",
            "favicon",
            "doubleclick",
            "google-analytics",
        ])
    ]
    assert relevant == [], f"Unexpected console errors: {relevant}"
