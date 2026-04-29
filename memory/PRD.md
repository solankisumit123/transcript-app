# Y/T_TRANSCRIPT — Product Requirements & Architecture (v2.0)

## Original Problem Statement
Conduct a comprehensive analysis of youtubetranscript.com and develop an enterprise-grade
web application specification that extends far beyond basic transcript extraction —
including multi-format video/audio download (4K), 100+-language neural translation,
AI summarization, batch processing (≤1,000 files), speaker-ID transcription, audio
enhancement, subtitle editor with sync, content moderation, OAuth 2.0 / JWT auth,
microservices on Docker/K8s, full DB schema, REST API spec, SLOs, security,
compliance and 5-phase rollout plan.

## Persona
- Content Creators (read/translate/summarize fast)
- Researchers / Journalists (timestamped citations, speaker ID)
- Localization Studios (mass translation)
- Developers (public REST + webhooks)
- Enterprises (SSO, GDPR/SOC2, on-prem)

## Core Requirements (static)
1. Comprehensive enterprise specification doc — DB schema, REST APIs, security,
   SLOs, deployment, compliance, 5 implementation phases, testing strategy.
2. Functional MVP demonstrating: transcript extraction, AI summarization,
   multi-language translation, real-time async pipeline, downloader,
   speaker-ID transcription.
3. Distinctive non-AI-slop UI (brutalist obsidian + electric orange + Outfit /
   JetBrains Mono).
4. Comprehensive automated tests, CI, observability, rollback plan.
5. NO pricing / payment surfaces (per product direction in iteration 3).

## What's been implemented

### v1.0 — 2026-04-28 (initial MVP + spec)
- Spec doc `/app/SPECIFICATION.md` (18 sections).
- FastAPI backend: extract / summarize (Claude Sonnet 4.5) / translate (GPT-4o).
- React + Tailwind frontend with brutalist design system.
- Pricing UI, mock job model, curated YouTube fallback.
- 13 backend pytests, 8 Playwright E2E, CI workflow, TESTING.md.

### v2.0 — 2026-04-28 (real-time pipeline)
- **Real YouTube transcript pipeline** (`transcript_service.py`):
  - Strategy 1: `youtube-transcript-api` with optional residential proxy
  - Strategy 2: YouTube Data API v3 (lists captions; full body needs OAuth)
  - Strategy 3: `yt-dlp` subtitle extraction (vtt/srt parser)
  - Strategy 4: curated demo (last resort)
  - Per-route token-bucket rate limiting (Redis)
  - Structured retry + exponential backoff per strategy
- **Pricing removed** — UI section, nav links, footer links all stripped.
- **Celery + Redis async queue** (`celery_app.py`, `tasks.py`, `pubsub.py`):
  - 4 task types: extract, download, transcribe, batch_dispatch
  - Auto-retry with exponential backoff
  - Job state mirrored to MongoDB + Redis pub/sub
  - Routing across 4 queues: default / ai / downloads / transcribe
- **ffmpeg downloader microservice** (`media_service.py` `download_media`):
  - MP4 / WebM up to 4K resolution
  - MP3 / WAV / AAC / FLAC audio extraction
  - Real-time progress hooks → pub/sub
  - Optional proxy support
  - File retrieval endpoint
- **Speaker-ID transcription** (`media_service.py` `transcribe_audio`):
  - faster-whisper (CPU, configurable model size via `WHISPER_MODEL`)
  - WhisperX-compatible output (segments, words, timings, speaker labels)
  - Heuristic silence-gap diarization with documented plug-point for
    pyannote.audio when `WHISPERX_ENABLED=true` + `HF_TOKEN` set
- **Real-time WebSocket** (`/api/ws/jobs/{job_id}`):
  - Replays last known state on connect
  - Streams pub/sub events, closes on terminal status
- **Batch endpoint** `/api/jobs/batch` — up to 1000 children, parent-aggregated.
- **Observability**:
  - Prometheus `/metrics` (8 metric families)
  - Lite JSON `/api/metrics/json`
  - structlog JSON logs
  - `X-Response-Time-ms` headers
- **OpenAPI** auto-generated → `/api/openapi.json` + Swagger `/api/docs` + ReDoc `/api/redoc`.
- **Frontend**:
  - New "Live processing" pipeline section with download + transcribe cards
  - WebSocket-driven progress bars + status streams
  - Strategy badge in TranscriptViewer (`VIA [YT_DLP]` / `[CURATED_DEMO]` etc.)
  - Pricing removed from nav, footer, body
- **Tests**:
  - 28 backend pytests (test_yt_transcript_api.py + test_pipeline.py)
  - WebSocket streaming test, batch test, rate-limit test, prometheus test, openapi test
  - Frontend Playwright suite + stress runner
- **CI** `/app/.github/workflows/ci.yml` with Mongo service container.
- **Docs** `/app/docs/TESTING.md` — fully updated for v2.0.
- **Supervisor**: redis + celery-worker added as managed services.

## Architecture (v2)
- React 19 + Tailwind + @phosphor-icons/react
- FastAPI 0.110 (Python 3.11) + Uvicorn
- MongoDB 7 (async via motor)
- Redis 7 (broker + pub/sub + rate-limit token buckets)
- Celery 5.6 worker (4 queues, prefork concurrency 2)
- yt-dlp + ffmpeg for media
- faster-whisper for transcription
- emergentintegrations LlmChat (Claude + GPT)
- WebSocket via FastAPI + websockets

## Backlog (post-v2)
### P0
- Real YouTube media downloads through proxy (currently 403s on cloud IP)
- Real diarization (pyannote.audio + HF token)
- OAuth 2.0 (Google / GitHub) auth
- API keys for programmatic clients
### P1
- Subtitle editor + SRT/VTT/ASS export
- Forced alignment subtitle sync
- Vector index for transcript search (OpenSearch + embeddings)
- Webhooks for job state changes
### P2
- Audio enhancement (RNNoise / DeepFilterNet)
- Content moderation classifiers
- PWA offline mode
- SOC 2 Type II audit prep

## Next tasks
1. Configure residential proxy via `YT_PROXY_URL` for production
2. Wire pyannote.audio for real diarization (gated behind `WHISPERX_ENABLED`)
3. Add OAuth login flow
4. Issue API keys with per-key rate limits

## Known limitations
- Cloud IP routinely blocks YouTube media downloads (works for subtitles via yt-dlp)
- Heuristic speaker labels are silence-gap based, not voice-print
- `youtube_data_api` strategy can list captions but cannot download body without OAuth
- WhisperX is implemented as `faster-whisper` + heuristic diarization until GPU + HF token are available
