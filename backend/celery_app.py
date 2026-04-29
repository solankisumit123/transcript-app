"""Celery + Redis configuration."""
from __future__ import annotations

import sys
from pathlib import Path

# Add local 'packages' directory to sys.path to support bundled dependencies
_root = Path(__file__).parent
_packages_dir = _root / "packages"
if _packages_dir.exists() and str(_packages_dir) not in sys.path:
    sys.path.insert(0, str(_packages_dir))

import os
from pathlib import Path
from dotenv import load_dotenv
from celery import Celery

load_dotenv(Path(__file__).parent / ".env")

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")

# Check if Redis is available
redis_available = False
try:
    _client = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2)
    _client.ping()
    redis_available = True
except (redis.ConnectionError, Exception):
    print(f"Redis not available at {REDIS_URL}, using task_always_eager=True")

celery = Celery(
    "yt_transcript",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks"],
)

celery.conf.update(
    task_always_eager=False,
    broker_connection_retry_on_startup=False, # Fail fast if Redis is down
    worker_prefetch_multiplier=1,
    result_expires=3600,
)
