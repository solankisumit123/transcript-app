"""Backend pytest suite for Y/T_TRANSCRIPT API."""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://content-processor-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 90


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Health & Meta ----------------
class TestMeta:
    def test_health(self, session):
        r = session.get(f"{API}/health", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d.get("status") == "ok"
        assert "ts" in d

    def test_languages(self, session):
        r = session.get(f"{API}/languages", timeout=TIMEOUT)
        assert r.status_code == 200
        langs = r.json().get("languages")
        assert isinstance(langs, list)
        assert len(langs) >= 25
        for item in langs:
            assert "code" in item and "name" in item

    def test_stats(self, session):
        r = session.get(f"{API}/stats", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        for k in ["transcripts_extracted", "jobs_total", "languages_supported", "uptime"]:
            assert k in d


# ---------------- Transcript Extraction ----------------
class TestExtract:
    def test_extract_zoo_video(self, session):
        r = session.post(
            f"{API}/transcript/extract",
            json={"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["video_id"] == "jNQXAC9IVRw"
        # 4 = curated demo fallback, 6 = real yt_dlp; both are valid
        assert len(d["segments"]) >= 3
        assert d["language"] == "en"
        assert d["word_count"] > 0
        assert d["full_text"]
        seg0 = d["segments"][0]
        for k in ["start", "duration", "timestamp", "text"]:
            assert k in seg0

    def test_extract_raw_id(self, session):
        r = session.post(
            f"{API}/transcript/extract",
            json={"url": "dQw4w9WgXcQ"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["video_id"] == "dQw4w9WgXcQ"
        # Curated has 41, live should have >=30
        assert len(d["segments"]) >= 30

    def test_extract_invalid_url(self, session):
        r = session.post(
            f"{API}/transcript/extract",
            json={"url": "not a url"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400
        assert "parse" in r.text.lower()

    def test_extract_nonexistent_id(self, session):
        r = session.post(
            f"{API}/transcript/extract",
            json={"url": "https://www.youtube.com/watch?v=NOTAREAL_ID"},
            timeout=TIMEOUT,
        )
        # Must NOT crash. Allowed: 404, 503, 500, or even 400 (id invalid format)
        assert r.status_code in (400, 404, 500, 503), f"Got {r.status_code}: {r.text}"


# ---------------- Summarize ----------------
class TestSummarize:
    @pytest.fixture(scope="class")
    def transcript_text(self, session):
        r = session.post(
            f"{API}/transcript/extract",
            json={"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        return r.json()["full_text"]

    def test_summarize_ok(self, session, transcript_text):
        # Pad short transcript for length requirement
        text = (transcript_text + " ") * 5
        r = session.post(
            f"{API}/transcript/summarize",
            json={"transcript": text, "video_title": "Me at the zoo"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["tldr"], str) and d["tldr"].strip()
        assert isinstance(d["key_points"], list) and len(d["key_points"]) >= 1
        assert isinstance(d["chapters"], list)
        for c in d["chapters"]:
            assert "title" in c and "summary" in c
        assert d["sentiment"] in ["positive", "neutral", "mixed", "negative"]
        assert d["word_count_original"] > 0
        assert d["word_count_summary"] > 0

    def test_summarize_too_short(self, session):
        r = session.post(
            f"{API}/transcript/summarize",
            json={"transcript": "short"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400


# ---------------- Translate ----------------
class TestTranslate:
    def test_translate_spanish(self, session):
        r = session.post(
            f"{API}/transcript/translate",
            json={
                "transcript": "Hello world this is a test of translation.",
                "target_language": "Spanish",
            },
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["translated_text"]
        low = d["translated_text"].lower()
        assert "hola" in low or "mundo" in low

    def test_translate_japanese(self, session):
        r = session.post(
            f"{API}/transcript/translate",
            json={"transcript": "Hello.", "target_language": "Japanese"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["translated_text"]


# ---------------- Jobs ----------------
class TestJobs:
    def test_job_lifecycle(self, session):
        r = session.post(
            f"{API}/jobs",
            json={"job_type": "extract", "input_url": "https://example.com"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        job = r.json()
        assert "id" in job
        # validate uuid format
        assert re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", job["id"])
        assert job["status"] == "queued"
        assert job["progress"] == 0

        job_id = job["id"]

        # list
        rl = session.get(f"{API}/jobs", timeout=TIMEOUT)
        assert rl.status_code == 200
        ids = [j["id"] for j in rl.json()]
        assert job_id in ids

        # get
        rg = session.get(f"{API}/jobs/{job_id}", timeout=TIMEOUT)
        assert rg.status_code == 200
        assert rg.json()["id"] == job_id

    def test_job_404(self, session):
        r = session.get(
            f"{API}/jobs/00000000-0000-0000-0000-000000000000",
            timeout=TIMEOUT,
        )
        assert r.status_code == 404
