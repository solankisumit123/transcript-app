"""
Celery tasks: transcript extraction, summarization, translation, transcription.
Each task publishes progress to Redis pub/sub and updates the job document in
MongoDB.

NOTE: The media downloader was removed in v3.0 (see docs/adr/0001-remove-downloader.md).
yt-dlp is retained ONLY for subtitle extraction inside transcript_service.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from celery_app import celery
from pubsub import publish_progress
from observability import (
    log,
    jobs_completed_total,
    job_duration_seconds,
)
from pymongo import MongoClient

# Synchronous mongo client (Celery tasks are sync)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
LOCAL_MOCK_DB = "127.0.0.1" in MONGO_URL or "localhost" in MONGO_URL
if not LOCAL_MOCK_DB:
    _mongo = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
    _db = _mongo[os.environ.get("DB_NAME", "yt_transcript_dev")]


def _run_db(awaitable):
    """Run an async coroutine safely from a sync context (e.g., Celery task)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Already in an async context — create a new loop in a thread-safe way
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(asyncio.run, awaitable)
                return future.result()
        return loop.run_until_complete(awaitable)
    except RuntimeError:
        return asyncio.run(awaitable)


def _set_job(job_id: str, **fields):
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    if LOCAL_MOCK_DB:
        from server import db as async_db

        _run_db(async_db.jobs.update_one({"id": job_id}, {"$set": fields}))
        return
    _db.jobs.update_one({"id": job_id}, {"$set": fields})


def _insert_transcript(doc: Dict[str, Any]) -> None:
    if LOCAL_MOCK_DB:
        from server import db as async_db

        _run_db(async_db.transcripts.insert_one(doc))
        return
    _db.transcripts.insert_one(doc)


def _insert_transcription(doc: Dict[str, Any]) -> None:
    if LOCAL_MOCK_DB:
        from server import db as async_db

        _run_db(async_db.transcriptions.insert_one(doc))
        return
    _db.transcriptions.insert_one(doc)


def _wrap(job_type: str):
    """Decorator factory that records duration + outcome metrics."""
    def deco(fn):
        def wrapped(self, *args, **kwargs):
            t0 = datetime.now(timezone.utc).timestamp()
            try:
                result = fn(self, *args, **kwargs)
                jobs_completed_total.labels(job_type=job_type, outcome="success").inc()
                return result
            except Exception:  # noqa: BLE001
                jobs_completed_total.labels(job_type=job_type, outcome="failure").inc()
                raise
            finally:
                job_duration_seconds.labels(job_type=job_type).observe(
                    datetime.now(timezone.utc).timestamp() - t0
                )
        wrapped.__name__ = fn.__name__
        return wrapped
    return deco


# ---------------------------------------------------------------------------
# 1. Extract transcript
# ---------------------------------------------------------------------------
@celery.task(
    name="tasks.task_extract_transcript",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
@_wrap("extract")
def task_extract_transcript(self, job_id: str, url: str, language: Optional[str] = None):
    from transcript_service import fetch_transcript, TranscriptError, extract_video_id_safe

    publish_progress(job_id, status="processing", progress=5, message="parsing URL")
    _set_job(job_id, status="processing", progress=5)

    try:
        video_id = extract_video_id_safe(url)
    except Exception as e:  # noqa: BLE001
        msg = f"invalid URL: {e}"
        publish_progress(job_id, status="failed", progress=100, message=msg)
        _set_job(job_id, status="failed", progress=100, error=msg)
        raise

    publish_progress(job_id, status="processing", progress=20, message="fetching captions")
    try:
        result = fetch_transcript(video_id, language=language)
    except TranscriptError as e:
        publish_progress(job_id, status="failed", progress=100, message=str(e))
        _set_job(job_id, status="failed", progress=100, error=str(e))
        raise

    full_text = " ".join(s["text"] for s in result.segments)
    duration = max((s["start"] + s["duration"]) for s in result.segments) if result.segments else 0.0
    payload = {
        "video_id": video_id,
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
        "title": result.title,
        "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        "language": result.language,
        "segments": result.segments,
        "full_text": full_text,
        "duration": duration,
        "word_count": len(full_text.split()),
        "strategy": result.strategy,
    }
    _insert_transcript({**payload, "id": job_id, "extracted_at": datetime.now(timezone.utc).isoformat()})
    publish_progress(job_id, status="done", progress=100, message="done", data=payload)
    _set_job(job_id, status="done", progress=100, result_id=job_id, result_kind="transcript")
    return payload


# ---------------------------------------------------------------------------
# 2. Transcribe uploaded audio (with speaker ID)
# ---------------------------------------------------------------------------
@celery.task(
    name="tasks.task_transcribe_audio",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 1},
    time_limit=1800,
)
@_wrap("transcribe")
def task_transcribe_audio(self, job_id: str, audio_path: str, language: Optional[str] = None):
    from media_service import transcribe_audio, cleanup

    def report(p, msg):
        publish_progress(job_id, status="processing", progress=p, message=msg)
        _set_job(job_id, status="processing", progress=p)

    publish_progress(job_id, status="processing", progress=1, message="loading audio")
    _set_job(job_id, status="processing", progress=1)
    try:
        result = transcribe_audio(audio_path, language=language, on_progress=report)
    except Exception as e:  # noqa: BLE001
        msg = f"transcription failed: {e}"
        publish_progress(job_id, status="failed", progress=100, message=msg)
        _set_job(job_id, status="failed", progress=100, error=msg)
        cleanup(audio_path)
        raise
    _insert_transcription(
        {"id": job_id, **result, "created_at": datetime.now(timezone.utc).isoformat()}
    )
    publish_progress(job_id, status="done", progress=100, message="done", data=result)
    _set_job(job_id, status="done", progress=100, result_id=job_id, result_kind="transcription")
    cleanup(audio_path)
    return result


# ---------------------------------------------------------------------------
# 3. Transcribe from YouTube URL/ID
# ---------------------------------------------------------------------------
@celery.task(
    name="tasks.task_transcribe_url",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 1},
    time_limit=1800,
)
@_wrap("transcribe")
def task_transcribe_url(self, job_id: str, url: str, language: Optional[str] = None):
    from media_service import cleanup, download_youtube_audio, transcribe_audio

    def report(p, msg):
        publish_progress(job_id, status="processing", progress=p, message=msg)
        _set_job(job_id, status="processing", progress=p)

    publish_progress(job_id, status="processing", progress=1, message="resolving youtube url")
    _set_job(job_id, status="processing", progress=1)

    audio_path = None
    try:
        audio_path = download_youtube_audio(url, on_progress=report)
        result = transcribe_audio(audio_path, language=language, on_progress=report)
    except Exception as e:  # noqa: BLE001
        msg = f"transcription failed: {e}"
        publish_progress(job_id, status="failed", progress=100, message=msg)
        _set_job(job_id, status="failed", progress=100, error=msg)
        if audio_path:
            cleanup(audio_path)
        raise
    def fmt_ts(s: float) -> str:
        h = int(s // 3600)
        m = int((s % 3600) // 60)
        sc = int(s % 60)
        return f"{h:02}:{m:02}:{sc:02}" if h > 0 else f"{m:02}:{sc:02}"

    formatted_segments = []
    total_duration = 0.0
    for i, seg in enumerate(result.get("segments", [])):
        start = float(seg.get("start", 0))
        duration = float(seg.get("end", 0)) - start if "end" in seg else float(seg.get("duration", 2.0))
        end = start + duration
        total_duration = max(total_duration, end)
        formatted_segments.append({
            "index": i,
            "start": start,
            "duration": duration,
            "end": end,
            "timestamp": fmt_ts(start),
            "text": seg.get("text", "")
        })

    full_text = " ".join(s["text"] for s in formatted_segments)
    
    # Try to extract video ID for thumbnail/URL
    import re
    video_id = url
    m = re.search(r"(?:v=|/)([0-9A-Za-z_-]{11})", url)
    if m:
        video_id = m.group(1)

    payload = {
        "id": job_id,
        "video_id": video_id,
        "video_url": f"https://www.youtube.com/watch?v={video_id}" if len(video_id) == 11 else url,
        "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg" if len(video_id) == 11 else "",
        "title": f"AI Transcription of {video_id}",
        "language": result.get("language", "en"),
        "segments": formatted_segments,
        "full_text": full_text,
        "duration": total_duration,
        "word_count": len(full_text.split()),
        "strategy": "ai_speech_to_text",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    _insert_transcription(payload)
    # PyMongo injects an _id of type ObjectId which is not JSON serializable
    payload.pop("_id", None)
    
    publish_progress(job_id, status="done", progress=100, message="done", data=payload)
    _set_job(job_id, status="done", progress=100, result_id=job_id, result_kind="transcription")
    cleanup(audio_path)
    return payload


# ---------------------------------------------------------------------------
# 4. Batch dispatcher (extract only — download removed in v3.0)
# ---------------------------------------------------------------------------
@celery.task(name="tasks.task_batch_dispatch")
def task_batch_dispatch(parent_job_id: str, child_job_ids: List[str], items: List[Dict[str, Any]]):
    """Dispatches a batch of child jobs (extract only). Limited to 1000 items."""
    items = items[:1000]
    if len(child_job_ids) != len(items):
        raise ValueError("child_job_ids length mismatch")

    publish_progress(parent_job_id, status="processing", progress=0, message=f"dispatching {len(items)}")
    _set_job(parent_job_id, status="processing", progress=0)

    for cid, item in zip(child_job_ids, items):
        job_type = item.get("job_type", "extract")
        if job_type == "extract":
            task_extract_transcript.delay(cid, item["url"], item.get("language"))
        else:
            _set_job(cid, status="failed", error=f"unsupported batch job_type: {job_type}")

    publish_progress(parent_job_id, status="processing", progress=5, message="children enqueued")
    _set_job(parent_job_id, status="processing", progress=5)
    return {"parent_job_id": parent_job_id, "count": len(items)}
