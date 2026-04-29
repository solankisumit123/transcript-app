"""
Lightweight stress / load helper.

Pure-Python concurrent client for /api/transcript/extract with curated demo IDs.
Aims to validate the platform handles bursts of traffic without 5xx errors.

Run:
    BASE_URL=http://localhost:8001 python tests/load/stress_extract.py --concurrency 50 --total 500
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import random
import statistics
import sys
import time

import requests

DEMO_IDS = ["dQw4w9WgXcQ", "jNQXAC9IVRw", "9bZkp7q19f0"]


def hit(base: str) -> tuple[int, float]:
    vid = random.choice(DEMO_IDS)
    t0 = time.perf_counter()
    try:
        r = requests.post(
            f"{base}/api/transcript/extract",
            json={"url": f"https://www.youtube.com/watch?v={vid}"},
            timeout=30,
        )
        return r.status_code, (time.perf_counter() - t0) * 1000.0
    except requests.RequestException:
        return 0, (time.perf_counter() - t0) * 1000.0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--concurrency", type=int, default=20)
    p.add_argument("--total", type=int, default=200)
    p.add_argument("--base", default=os.environ.get("BASE_URL", "http://localhost:8001"))
    args = p.parse_args()

    print(f"-> POST {args.base}/api/transcript/extract — {args.total} reqs @ {args.concurrency} concurrent")
    t0 = time.perf_counter()
    statuses: list[int] = []
    latencies: list[float] = []

    with cf.ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = [ex.submit(hit, args.base) for _ in range(args.total)]
        for f in cf.as_completed(futs):
            s, ms = f.result()
            statuses.append(s)
            latencies.append(ms)

    elapsed = time.perf_counter() - t0
    ok = sum(1 for s in statuses if 200 <= s < 300)
    fail_5xx = sum(1 for s in statuses if s >= 500 or s == 0)
    fail_4xx = sum(1 for s in statuses if 400 <= s < 500)
    rps = len(statuses) / elapsed if elapsed > 0 else 0
    p50 = statistics.median(latencies)
    p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
    p99 = statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 100 else max(latencies)

    print(f"\nResults  ({elapsed:.1f}s)")
    print(f"  total      : {len(statuses)}")
    print(f"  2xx        : {ok}")
    print(f"  4xx        : {fail_4xx}")
    print(f"  5xx/conn   : {fail_5xx}")
    print(f"  rps        : {rps:.1f}")
    print(f"  latency p50: {p50:.0f} ms")
    print(f"  latency p95: {p95:.0f} ms")
    print(f"  latency p99: {p99:.0f} ms")

    # PASS criteria
    fail_rate = fail_5xx / len(statuses) if statuses else 1.0
    if fail_rate > 0.01:
        print(f"FAIL — 5xx rate {fail_rate:.2%} exceeds 1.0% threshold")
        return 1
    if p95 > 4000:
        print(f"FAIL — p95 {p95:.0f}ms exceeds 4000ms threshold")
        return 1
    print("PASS — within thresholds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
