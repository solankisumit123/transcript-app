# Y/T_TRANSCRIPT — Testing, Monitoring & Operations Guide (v2.0)

A practical playbook for everyone running the platform locally, in CI, in
staging, and in production. For the architectural specification see
[`SPECIFICATION.md`](../SPECIFICATION.md).

---

## 1. Local Setup

### 1.1 Prerequisites
- Python 3.11
- Node.js 20 + Yarn 1.22
- MongoDB 7 (local or Docker)
- Redis 7 (local or Docker)
- ffmpeg
- (optional) GPU + HuggingFace token for real WhisperX diarization

### 1.2 Bring up the stack
```bash
# OS-level deps
apt-get install -y redis-server ffmpeg

# Python
cd backend
pip install -r requirements.txt

# Node
cd ../frontend
yarn install
yarn start  # http://localhost:3000

# Supervisor manages everything in production / preview:
sudo supervisorctl status
# backend, celery-worker, redis, frontend, mongodb
```

### 1.3 Configuration parameters
| Env var | Component | Purpose |
|---|---|---|
| `MONGO_URL` | backend, celery | Mongo connection string |
| `DB_NAME` | backend, celery | Default DB name |
| `CORS_ORIGINS` | backend | Comma-list of allowed origins |
| `EMERGENT_LLM_KEY` | backend | Universal key for Claude + GPT |
| `REDIS_URL` | backend, celery | Redis broker + pub/sub |
| `DOWNLOAD_DIR` | backend, celery | Tmp dir for downloads + uploads |
| `WHISPER_MODEL` | celery | tiny / base / small / medium / large-v3 |
| `YT_PROXY_URL` | backend, celery | (optional) residential proxy for YouTube fetches |
| `YT_COOKIES_FILE` | celery | (optional) Netscape cookies file from a logged-in browser session for yt-dlp |
| `DOWNLOAD_MAX_RETRIES` | celery | (default 3) per-player-client retry attempts |
| `YOUTUBE_API_KEY` | backend | (optional) YouTube Data API v3 key |
| `WHISPERX_ENABLED` + `HF_TOKEN` | celery | (optional) real diarization |
| `REACT_APP_BACKEND_URL` | frontend | External base URL for `/api` calls |

---

## 2. Architecture (Real-time Pipeline)

```
[Frontend] ── REST ──────────► [FastAPI server.py]
    │                                │
    │                                ├──► MongoDB (jobs, transcripts, downloads, transcriptions)
    │                                │
    │                                ├──► Redis (broker + pub/sub + rate-limit tokens)
    │                                │       │
    │                                │       ▼
    │                                │   [Celery Worker]
    │                                │       │
    │                                │       ├──► transcript_service.py (4 strategies)
    │                                │       ├──► media_service.py (yt-dlp + ffmpeg)
    │                                │       └──► media_service.py (faster-whisper)
    │                                │
    └── WS ──────────────────────────┘  /api/ws/jobs/{job_id}
       (live progress)
```

**Strategies for transcript acquisition (best → worst):**
1. `youtube_transcript_api` (with optional `YT_PROXY_URL`)
2. `youtube_data_api` (when `YOUTUBE_API_KEY` is set; lists captions, full body needs OAuth)
3. `yt_dlp` (downloads `vtt`/`srt` subtitles; works behind proxy)
4. `curated_demo` (last resort for the 3 hero demo IDs)

Per-route token-bucket rate limiting via Redis.

---

## 3. Test Pyramid

| Layer | Tooling | Location | When |
|---|---|---|---|
| Unit + integration (backend) | `pytest` | `backend/tests/` | every PR |
| End-to-end (frontend) | `pytest-playwright` | `tests/e2e/` | every push to main |
| Stress / load | `tests/load/stress_extract.py` | `tests/load/` | nightly |
| Manual UAT | testers | – | pre-release |

### 3.1 Run the backend suite
```bash
pytest backend/tests/ -v --timeout=60
```
**Expected:** 28/28 pass (13 legacy + 15 v2 pipeline). Includes WebSocket
streaming, async extract, batch, prometheus, openapi, rate limiting.

### 3.2 Run the E2E suite
```bash
pip install pytest-playwright && playwright install chromium
pytest tests/e2e -v
```
**Pass criteria:** all scenarios green; zero unexpected console errors.

### 3.3 Run the stress test
```bash
python tests/load/stress_extract.py --concurrency 20 --total 200
```
**Pass criteria:** `5xx rate < 1%` AND `p95 latency < 4000 ms`.

For full 10K CCU testing use `k6` against staging — see
[`SPECIFICATION.md` §14](../SPECIFICATION.md#14-testing-strategy).

---

## 4. API Reference (v2)

### 4.1 Synchronous
| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/api/health` | – | Liveness (mongo + redis status) |
| `GET` | `/api/languages` | – | Translation languages |
| `GET` | `/api/stats` | – | Counts |
| `GET` | `/api/openapi.json` | – | Full machine-readable spec |
| `GET` | `/api/docs` | – | Swagger UI |
| `GET` | `/api/redoc` | – | ReDoc UI |
| `GET` | `/api/metrics/json` | – | Lite p50/p95/p99 |
| `GET` | `/metrics` | – | Prometheus format |
| `POST` | `/api/transcript/extract` | `{url, language?, async?}` | Sync default, set `async=true` for queue |
| `POST` | `/api/transcript/summarize` | `{transcript, video_title?, style?}` | Claude Sonnet 4.5 |
| `POST` | `/api/transcript/translate` | `{transcript, target_language}` | GPT-4o |

### 4.2 Async (Celery + Redis)
| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/api/jobs` | `{job_type, input_url, options?}` | Single job |
| `POST` | `/api/jobs/batch` | `{items: [...]}` | Up to 1000 jobs |
| `GET` | `/api/jobs?status=&limit=` | – | List + filter |
| `GET` | `/api/jobs/{id}` | – | Includes `live` field with last pub/sub state |
| `DELETE` | `/api/jobs/{id}` | – | Cancel queued/processing |
| `POST` | `/api/media/download` | `{url, kind, fmt, resolution?}` | yt-dlp + ffmpeg |
| `GET` | `/api/media/download/{id}/file` | – | Retrieve completed download |
| `POST` | `/api/media/transcribe` | multipart `file=@audio.mp3` | faster-whisper |
| `WS` | `/api/ws/jobs/{id}` | – | Live progress stream |

### 4.3 Sample async flow
```bash
# 1. Enqueue
curl -X POST $API/api/transcript/extract -d '{"url":"...","async":true}'
# → 202 {"job_id":"...","stream":"/api/ws/jobs/..."}

# 2. Stream progress
wscat -c $WS_URL/api/ws/jobs/<job_id>
# → {"status":"processing","progress":20,"message":"fetching captions"}
# → {"status":"done","progress":100,"data":{...}}

# 3. Or poll
curl $API/api/jobs/<job_id>  # includes "live" field with latest pub/sub state
```

### 4.4 Sample batch
```bash
curl -X POST $API/api/jobs/batch -d '{
  "items": [
    {"job_type": "extract", "url": "https://..."},
    {"job_type": "extract", "url": "https://..."},
    {"job_type": "download", "url": "https://...", "kind": "audio", "fmt": "mp3"}
  ]
}'
# → 200 {"batch_id":"...", "child_job_ids":[...], "stream":"/api/ws/jobs/<batch_id>"}
```

---

## 5. Real-Time Monitoring

### 5.1 Prometheus metrics (`GET /metrics`)
| Metric | Type | Labels |
|---|---|---|
| `http_requests_total` | counter | method, route, status |
| `http_request_latency_seconds` | histogram | route |
| `jobs_created_total` | counter | job_type |
| `jobs_completed_total` | counter | job_type, outcome |
| `job_duration_seconds` | histogram | job_type |
| `active_websocket_connections` | gauge | – |
| `youtube_fetch_strategy_total` | counter | strategy |

### 5.2 Lite JSON metrics (`GET /api/metrics/json`)
Same data as Prometheus but in compact JSON for non-Prom clients.

Each response also carries `X-Response-Time-ms`.

### 5.3 Structured logs
JSON via `structlog`. Every event includes `level`, `timestamp`, and contextual
keys. Examples:
```json
{"strategy": "yt_dlp", "video_id": "jNQXAC9IVRw", "segs": 6, "event": "transcript.fetched", "level": "info", "timestamp": "..."}
{"err": "...", "event": "strategy.yt_dlp.failed", "level": "info"}
```

### 5.4 Production observability stack
| Concern | Tool | Source |
|---|---|---|
| Metrics | Prometheus → Grafana | `/metrics` |
| Logs | Loki / CloudWatch | stdout JSON |
| Tracing | OpenTelemetry → Tempo | auto-instrument FastAPI + httpx |
| Synthetic checks | Pingdom / Checkly | hourly hit on `/api/health` |
| Frontend RUM | Sentry / Datadog RUM | injected at build time |

### 5.5 Alerting (Pager / Slack)
| Alert | Condition | Severity |
|---|---|---|
| API error budget burn — fast | `5xx rate > 2% for 1m` | P1 page |
| API error budget burn — slow | `5xx rate > 0.5% for 30m` | P2 ticket |
| Latency degradation | `histogram_quantile(0.95, http_request_latency_seconds) > 1.5s for 5m` | P2 ticket |
| LLM failures | `jobs_completed_total{outcome="failure",job_type=~"summarize|translate"} > 3 in 1m` | P2 ticket |
| Worker queue backlog | `redis queue length > 5000 for 2m` | P1 page |
| Strategy collapse | `youtube_fetch_strategy_total{strategy="curated_demo"}` > 50% of total | P3 — proxy needs attention |
| WebSocket churn | `active_websocket_connections` > 10000 sustained | P3 — capacity check |

---

## 6. CI Pipeline

`/.github/workflows/ci.yml` runs on every PR and push to `main`:

1. **`backend`** — installs deps, runs ruff, runs pytest with Mongo + Redis service containers.
2. **`frontend`** — installs yarn, runs ESLint, runs `yarn build`.
3. **`e2e`** — push-to-main only, Playwright Chromium against `STAGING_BASE_URL`.
4. **`release-rollback-check`** — guards docs presence.

Required CI secrets:
- `EMERGENT_LLM_KEY`
- `STAGING_BASE_URL`

---

## 7. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `503 — All transcript strategies failed` | Cloud IP blocked AND no proxy / API key configured AND not a curated demo ID | Set `YT_PROXY_URL` to a residential proxy, OR provide `YOUTUBE_API_KEY` (with OAuth for caption download), OR use one of the 3 demo videos. |
| `429 — Rate limit exceeded` | More than 30 extract or 10 download requests in short window from same IP | Wait — bucket refills at 0.5 / 0.2 tokens / sec respectively. |
| `502 — LLM error` on summarize/translate | `EMERGENT_LLM_KEY` missing or out of balance | Check `.env`; top up at Profile → Universal Key. |
| `Download failed: HTTP 403 Forbidden` (YouTube only) | YouTube blocks media bytes from cloud IPs at the googlevideo CDN layer (after metadata extraction succeeds). Surfaced via WebSocket as a clear actionable message. | (1) Configure `YT_PROXY_URL=<residential proxy>`, (2) Provide `YT_COOKIES_FILE=/path/to/cookies.txt` exported from a logged-in browser, (3) Use a direct HTTP media URL (always works). The implementation already cycles through `tv_embedded` → `android_creator` → `tv_embedded` → `android` player clients with rotating User-Agents and exponential backoff (3 inner retries × 4 client variants); only the CDN byte-fetch fails. |
| WebSocket not receiving events | Celery worker not running OR Redis not reachable | `sudo supervisorctl status celery-worker redis`; `redis-cli PING` should reply `PONG`. |
| Celery `KeyError: MONGO_URL` | `.env` not loaded by worker | `celery_app.py` does `load_dotenv` on import — confirm file path. |
| WhisperX heuristic speakers seem wrong | Heuristic is silence-gap based; not a real diarizer | Set `WHISPERX_ENABLED=true` and `HF_TOKEN=...` to plug in `pyannote.audio`. |
| Frontend `Loading...` forever | Backend down or wrong `REACT_APP_BACKEND_URL` | `sudo supervisorctl status backend`; verify `frontend/.env`. |
| Hot reload not picking up `.env` | dotenv loaded once at boot | `sudo supervisorctl restart backend celery-worker`. |

---

## 8. Rollback Strategy

### 8.1 Application rollback (Emergent preview)
1. Click **Rollback** in Emergent chat → choose checkpoint.
2. Verify `/api/health` returns 200 + `redis: true` + `mongo: true`.
3. Verify hero loads, demo extract works.

### 8.2 Production rollback (Kubernetes / Argo CD)
- Each service is an immutable container with semver tags.
- Argo Rollouts: progressive 10% → 50% → 100%.
- Auto-rollback triggers: `5xx > 2%` for 5 min OR `p95 > 2× baseline`.
- Manual:
  ```bash
  kubectl argo rollouts undo rollout/api-core -n yt-prod
  kubectl argo rollouts undo rollout/celery-worker -n yt-prod
  ```
- DB rollback: schema migrations are forward-only and backwards-compatible across one minor version. PITR via WAL-G if a destructive migration ships.

### 8.3 Verification checklist
1. `curl https://app.example.com/api/health` → `{"status":"ok","redis":true,"mongo":true}`
2. `/metrics` shows `youtube_fetch_strategy_total{strategy="curated_demo"}` < 5% of total
3. WS smoke: `wscat -c $WS/api/ws/jobs/<recent_id>` receives messages
4. E2E: `pytest tests/e2e -v --base-url https://app.example.com`

### 8.4 Communication
Every rollback triggers `#incidents` post: previous + current SHAs, alert(s),
decision-maker, post-mortem ticket.

---

## 9. Pass / Fail Criteria

| Suite | Pass | Fail |
|---|---|---|
| Backend pytest | 28/28 green | any red blocks merge |
| Frontend ESLint | 0 errors, 0 warnings | blocks merge |
| Frontend build | exit 0 | blocks merge |
| E2E Playwright | 100% green | flake retried once; 2nd failure blocks |
| Stress | 5xx < 1%, p95 < 4s | blocks release |
| SLO error rate | < 0.1% | pages on-call |
| SLO p95 latency | < 500ms read endpoints | pages on-call |

---

## 10. Where to read more
- Architecture & DB schema: [`SPECIFICATION.md`](../SPECIFICATION.md)
- API quickstart: home page → "Built for engineers"
- Roadmap: [`SPECIFICATION.md` §15](../SPECIFICATION.md#15-implementation-phases--roadmap)
- Live API reference: `GET /api/docs` (Swagger UI) or `/api/redoc`
