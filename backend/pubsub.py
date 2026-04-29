"""
Redis pub/sub helpers + JSON job-state cache.
Each job's progress is published on `job:{job_id}:progress` channel and
mirrored in `job:{job_id}:state` key for late subscribers.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
try:
    _client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    _client.ping()
except (redis.RedisError, Exception):
    import fakeredis
    _client = fakeredis.FakeRedis(decode_responses=True)


def _channel(job_id: str) -> str:
    return f"job:{job_id}:progress"


def _state_key(job_id: str) -> str:
    return f"job:{job_id}:state"


def publish_progress(
    job_id: str,
    *,
    status: str,
    progress: int,
    message: str = "",
    data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Publish progress and store latest state (TTL 1h)."""
    payload = {
        "job_id": job_id,
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "message": message,
        "data": data or {},
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    raw = json.dumps(payload)
    _client.publish(_channel(job_id), raw)
    _client.set(_state_key(job_id), raw, ex=3600)
    return payload


def get_state(job_id: str) -> Dict[str, Any] | None:
    raw = _client.get(_state_key(job_id))
    return json.loads(raw) if raw else None


def subscribe(job_id: str):
    """Returns a Redis pubsub object subscribed to the job's channel."""
    pubsub = _client.pubsub()
    pubsub.subscribe(_channel(job_id))
    return pubsub


def ping() -> bool:
    try:
        return _client.ping()
    except redis.RedisError:
        return False
