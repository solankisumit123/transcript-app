"""Structured logging + prometheus metrics setup."""
from __future__ import annotations

import logging
import sys

import structlog
from prometheus_client import Counter, Histogram, Gauge

# ---- structured logging --------------------------------------------------
def configure_logging() -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )


log = structlog.get_logger("yt_transcript")

# ---- prometheus metrics --------------------------------------------------
http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "route", "status"],
)
http_request_latency = Histogram(
    "http_request_latency_seconds",
    "HTTP request latency",
    ["route"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)
jobs_created_total = Counter(
    "jobs_created_total",
    "Jobs created",
    ["job_type"],
)
jobs_completed_total = Counter(
    "jobs_completed_total",
    "Jobs completed",
    ["job_type", "outcome"],
)
job_duration_seconds = Histogram(
    "job_duration_seconds",
    "Job duration",
    ["job_type"],
    buckets=(0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600),
)
active_websocket_connections = Gauge(
    "active_websocket_connections",
    "Active WebSocket connections",
)
youtube_fetch_strategy_total = Counter(
    "youtube_fetch_strategy_total",
    "Counts by which transcript strategy succeeded",
    ["strategy"],
)
