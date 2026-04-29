"""
Pytest suite for v2.0.0 — async pipeline + media + websocket + metrics.

Run:
    pytest backend/tests/test_pipeline.py -v
"""
from __future__ import annotations

import os
import time
import asyncio
import json

import pytest
import requests

BASE = os.environ.get("BASE_URL") or "http://localhost:8001"
API = f"{BASE}/api"


@pytest.fixture(scope="session")
def base_url():
    # Wait up to 30s for backend to be reachable (handles cold start / busy supervisor)
    for _ in range(30):
        try:
            r = requests.get(f"{API}/health", timeout=3)
            if r.status_code == 200:
                return BASE
        except requests.RequestException:
            time.sleep(1)
    pytest.fail("backend not reachable at " + BASE)


# ---- meta -----------------------------------------------------------------
def test_health_includes_redis_mongo(base_url):
    body = requests.get(f"{API}/health").json()
    assert body["redis"] is True and body["mongo"] is True


def test_openapi_published(base_url):
    r = requests.get(f"{API}/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec["info"]["title"] == "Y/T_TRANSCRIPT API"
    paths = spec.get("paths", {})
    for required in [
        "/api/transcript/extract",
        "/api/transcript/summarize",
        "/api/transcript/translate",
        "/api/media/transcribe",
        "/api/jobs",
        "/api/jobs/batch",
        "/api/jobs/{job_id}",
    ]:
        assert required in paths, f"missing path {required}"


def test_prometheus_metrics_endpoint(base_url):
    """Prometheus endpoint must be reachable both at root (in-cluster) and under /api (public ingress)."""
    # Public ingress path
    r1 = requests.get(f"{API}/metrics")
    assert r1.status_code == 200
    body1 = r1.text
    assert "http_requests_total" in body1
    assert "http_request_latency_seconds" in body1
    # Root path (cluster-internal scraping)
    r2 = requests.get(f"{base_url}/metrics")
    assert r2.status_code == 200
    assert "http_requests_total" in r2.text


def test_metrics_json_endpoint(base_url):
    r = requests.get(f"{API}/metrics/json")
    assert r.status_code == 200
    body = r.json()
    assert "uptime_sec" in body
    assert "routes" in body


# ---- transcript -----------------------------------------------------------
def test_sync_extract_returns_strategy(base_url):
    r = requests.post(
        f"{API}/transcript/extract",
        json={"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["video_id"] == "jNQXAC9IVRw"
    assert data["language"]
    assert len(data["segments"]) >= 3
    # strategy must be one of the documented strategies
    assert data["strategy"] in {
        "youtube_transcript_api",
        "youtube_transcript_api_proxy",
        "yt_dlp",
        "yt_dlp_proxy",
        "curated_demo",
    }


def test_async_extract_with_websocket(base_url):
    r = requests.post(
        f"{API}/transcript/extract",
        json={"url": "jNQXAC9IVRw", "async": True},
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    assert r.json()["stream"].endswith(job_id)

    # poll job state
    for _ in range(40):
        j = requests.get(f"{API}/jobs/{job_id}").json()
        if j["status"] in ("done", "failed"):
            break
        time.sleep(0.5)
    assert j["status"] == "done"
    assert j["progress"] == 100


def test_rate_limit_extract(base_url):
    """
    Bursting many requests from the same IP eventually hits 429.
    Uses an invalid URL so the request returns 400 immediately AFTER the
    rate-limit check consumes a token — bounded in wall time.
    """
    # Allow bucket to refill from any prior tests
    time.sleep(3)
    statuses = []
    for _ in range(60):
        try:
            r = requests.post(
                f"{API}/transcript/extract",
                json={"url": "obviously-not-a-yt-link"},
                timeout=5,
            )
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        except requests.RequestException:
            break
    assert any(s == 429 for s in statuses), f"never hit 429: counts={sorted(set(statuses))}"
    # Allow bucket to refill enough for downstream tests
    time.sleep(15)


def test_extract_invalid_url(base_url):
    r = requests.post(f"{API}/transcript/extract", json={"url": "not a url"})
    assert r.status_code == 400


# ---- jobs -----------------------------------------------------------------
def test_jobs_list_and_filter(base_url):
    r = requests.get(f"{API}/jobs?limit=10")
    assert r.status_code == 200
    jobs = r.json()
    assert isinstance(jobs, list)
    if jobs:
        # filter by status
        target = jobs[0]["status"]
        r2 = requests.get(f"{API}/jobs?status={target}&limit=5")
        assert r2.status_code == 200
        assert all(j["status"] == target for j in r2.json())


def test_job_404(base_url):
    r = requests.get(f"{API}/jobs/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_batch_create(base_url):
    body = {
        "items": [
            {"job_type": "extract", "url": "jNQXAC9IVRw"},
            {"job_type": "extract", "url": "dQw4w9WgXcQ"},
            {"job_type": "extract", "url": "9bZkp7q19f0"},
        ]
    }
    r = requests.post(f"{API}/jobs/batch", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert "batch_id" in out
    assert len(out["child_job_ids"]) == 3


def test_batch_size_limit(base_url):
    body = {"items": [{"job_type": "extract", "url": "jNQXAC9IVRw"}] * 1001}
    r = requests.post(f"{API}/jobs/batch", json=body)
    assert r.status_code == 400


# ---- media: downloader REMOVED in v3.0 (see docs/adr/0001-remove-downloader.md)
def test_download_endpoint_removed(base_url):
    """v3.0 contract: /api/media/download must return 404."""
    r = requests.post(
        f"{API}/media/download",
        json={"url": "https://example.com/x.mp3", "kind": "audio", "fmt": "mp3"},
    )
    assert r.status_code == 404, f"endpoint should be removed; got {r.status_code}"
    r2 = requests.get(f"{API}/media/download/some-id/file")
    assert r2.status_code == 404


def test_openapi_no_download_paths(base_url):
    """v3.0 contract: OpenAPI spec must not advertise downloader endpoints."""
    spec = requests.get(f"{API}/openapi.json").json()
    paths = spec.get("paths", {})
    forbidden = [p for p in paths if "/media/download" in p]
    assert forbidden == [], f"downloader paths still in spec: {forbidden}"


# ---- WebSocket ------------------------------------------------------------
def test_websocket_streams_progress(base_url):
    import websockets

    async def _go():
        r = requests.post(
            f"{API}/transcript/extract", json={"url": "jNQXAC9IVRw", "async": True}
        )
        job_id = r.json()["job_id"]
        ws_url = base_url.replace("http", "ws") + f"/api/ws/jobs/{job_id}"
        events = []
        async with websockets.connect(ws_url) as ws:
            end = time.time() + 25
            while time.time() < end:
                try:
                    m = await asyncio.wait_for(ws.recv(), timeout=2)
                    payload = json.loads(m)
                    if payload.get("status"):
                        events.append(payload)
                        if payload["status"] in ("done", "failed"):
                            break
                except asyncio.TimeoutError:
                    continue
        return events

    events = asyncio.run(_go())
    assert events, "no events received"
    assert events[-1]["status"] in ("done", "failed")
    if events[-1]["status"] == "done":
        assert events[-1]["progress"] == 100
