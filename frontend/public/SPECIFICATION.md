# Y/T_TRANSCRIPT — Enterprise Media Processing Platform
## Technical Requirements & Architecture Specification (v1.0)

> A next-generation media processing platform that extends far beyond basic YouTube
> transcript extraction. This document defines the production-ready, enterprise-grade
> system in full: functional surface, architecture, data, APIs, security, performance,
> deployment and rollout plan.

---

## 0. Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Competitive Analysis: youtubetranscript.com](#2-competitive-analysis-youtubetranscriptcom)
3. [Product Surface & Feature Matrix](#3-product-surface--feature-matrix)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [REST API Specification](#6-rest-api-specification)
7. [Security Requirements](#7-security-requirements)
8. [Performance & SLO Targets](#8-performance--slo-targets)
9. [Responsive & PWA Specification](#9-responsive--pwa-specification)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Authentication & Identity](#11-authentication--identity)
12. [Payments & Billing](#12-payments--billing)
13. [Scalability & Capacity Planning](#13-scalability--capacity-planning)
14. [Testing Strategy](#14-testing-strategy)
15. [Implementation Phases & Roadmap](#15-implementation-phases--roadmap)
16. [Observability & Operations](#16-observability--operations)
17. [Compliance](#17-compliance)
18. [Appendix](#18-appendix)

---

## 1. Executive Summary

**Y/T_TRANSCRIPT** is an enterprise media processing platform that takes a YouTube URL
(or any uploaded media file) and returns a complete, structured intelligence package:
transcripts with timestamps and speaker IDs, AI summaries, neural translation in
100+ languages, format conversion (4K MP4, WebM, AVI, MP3/WAV/AAC/FLAC), subtitle
editing, audio enhancement and content moderation. Where youtubetranscript.com
ships a single bootstrap page, **Y/T_TRANSCRIPT** ships a microservices platform
with a SaaS funnel (Free / Pro / Enterprise), public REST + GraphQL APIs, a
batch pipeline up to 1,000 concurrent files, OAuth 2.0 / JWT identity, and a
99.9% uptime SLA.

**Primary Personas**

| Persona | Need |
|---|---|
| Content Creator | Quickly read, summarize, translate and clip videos. |
| Researcher / Journalist | Search inside hours of footage, cite with timestamps. |
| Localization Studio | Mass translate captions across 100+ languages. |
| Podcaster / Audio Producer | Speaker-labeled transcripts, audio enhancement. |
| Developer / Platform | Public API + webhooks for automation pipelines. |
| Enterprise IT | SSO, GDPR/SOC2, on-prem / VPC deploy. |

---

## 2. Competitive Analysis: youtubetranscript.com

| Dimension | youtubetranscript.com | Y/T_TRANSCRIPT |
|---|---|---|
| Core feature | Read YouTube transcript in browser | Read + summarize + translate + download + edit |
| Backend | Undocumented YouTube API scraping, no public API | Public REST + Webhooks + GraphQL |
| Auth | None | JWT + OAuth 2.0 + SSO |
| Languages | English (default), some auto-translate | 100+ neural languages |
| Output formats | Copy as plain text | TXT, SRT, VTT, ASS, JSON, DOCX |
| Audio/Video download | None | MP4 4K, WebM, AVI, MP3, WAV, AAC, FLAC |
| Batch processing | None | Up to 1,000 jobs/queue |
| Speaker identification | None | Diarized transcription |
| AI summarization | None (links out to youtubesummaries.com) | Native, Claude / GPT |
| SLA | Best effort | 99.9% with autoscaling |
| Mobile UX | Bootstrap responsive | Custom PWA, offline-friendly |
| Monetization | Affiliate banner | Free / Pro / Enterprise + usage billing |
| Compliance | None stated | GDPR, SOC 2, HIPAA-ready |

**Conclusion.** The opportunity is to take the "paste-and-go" speed users love about
youtubetranscript.com and wrap it in an enterprise media pipeline that creators,
research teams, localization studios and developer platforms can build on.

---

## 3. Product Surface & Feature Matrix

### 3.1 Functional Modules

1. **Transcript Extraction**
   - YouTube URL / video ID / shorts / embed parsing
   - Auto language selection with ISO fallback chain (`req.lang → en → first-available`)
   - Returns segments: `{index, start, end, duration, timestamp, text}`
   - Word count, total duration, language code, source thumbnail
2. **Video Downloader**
   - Containers: MP4 (H.264/H.265/AV1), WebM (VP9), AVI
   - Resolutions: 144p, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p (4K)
   - Adaptive (DASH / HLS) reassembly via ffmpeg
3. **Audio Extractor**
   - Lossy: MP3 (128/192/320 kbps), AAC (128/192/256 kbps)
   - Lossless: WAV, FLAC
   - Optional channel mixdown (stereo → mono / 5.1 → stereo)
4. **Subtitle Editor**
   - Per-segment timing nudges (±ms precision)
   - Style: bold/italic, color, position, line-break
   - Multi-track support (SRT, VTT, ASS, TTML, SAMI, JSON)
5. **Real-Time Translation (100+ languages)**
   - Neural MT with context window (segment + ±2 segments)
   - Glossary upload (CSV → term-locked translations)
   - Streamed responses via SSE
6. **AI Summarizer**
   - TL;DR, key bullets, chapter breakdown, sentiment
   - Models: Claude Sonnet 4.5 (default), GPT-4o, GPT-5.2 (opt-in)
   - Configurable style: comprehensive / concise / bullet
7. **Batch Processing (≤ 1,000 files)**
   - Queue with priorities, retries, exponential backoff
   - Progress, ETA, webhooks per job state
8. **Speaker-ID Transcription** (uploads)
   - Diarization (pyannote / WhisperX) — speaker labels A/B/C/...
   - Per-speaker word counts and talk-time analytics
9. **Audio Enhancement**
   - RNNoise / DeepFilterNet noise reduction
   - LUFS-normalized output (default −16 LUFS for podcasts)
10. **Subtitle Synchronization**
    - Forced alignment via Montreal Forced Aligner / WhisperX
    - Auto offset correction across the whole track
11. **Content Moderation**
    - NSFW / hate / violence / PII classifiers
    - Configurable thresholds per workspace, audit log

### 3.2 Plan Matrix

| Feature | Free | Pro ($19/mo) | Enterprise (custom) |
|---|---|---|---|
| Transcripts | Unlimited | Unlimited | Unlimited |
| AI summaries | 10 / mo | Unlimited | Unlimited |
| Translation | 5 / mo | Unlimited | Unlimited |
| Downloads | 720p, watermarked | up to 4K | up to 4K |
| Batch concurrency | 1 | 100 | 1,000 |
| API rate limit | 60 req/h | 10K req/mo | Custom |
| SLA | best-effort | 99.9% | 99.99% |
| SSO / SAML | – | – | ✅ |
| VPC / on-prem | – | – | ✅ |
| Compliance reports | – | – | SOC 2, GDPR, HIPAA |

---

## 4. System Architecture

### 4.1 High-Level Diagram

```
            ┌────────────────────────┐
            │  Cloudflare CDN + WAF  │
            └────────────┬───────────┘
                         │
                ┌────────▼────────┐
                │    API Gateway   │  (Kong / NGINX) — authn/z, rate limit
                └────────┬────────┘
        ┌────────────────┼────────────────────────────────────┐
        │                │                                    │
┌───────▼──────┐  ┌──────▼───────┐  ┌─────────────┐  ┌────────▼────────┐
│ web-frontend │  │  api-core    │  │ media-svc   │  │  worker fleet   │
│ Next.js / CDN│  │  FastAPI     │  │  Go + ffmpeg│  │ Celery / RQ     │
└──────────────┘  └──────┬───────┘  └──────┬──────┘  └────────┬────────┘
                         │                 │                  │
                  ┌──────▼─────────────────▼──────────────────▼──────┐
                  │                Message Bus (RabbitMQ)            │
                  └──────┬─────────────────┬──────────────────┬──────┘
                         │                 │                  │
                ┌────────▼──────┐ ┌────────▼──────┐ ┌─────────▼───────┐
                │ ai-svc        │ │ translate-svc │ │ moderation-svc  │
                │ (Claude/GPT)  │ │ (Neural MT)   │ │ (classifiers)   │
                └────────┬──────┘ └────────┬──────┘ └─────────┬───────┘
                         │                 │                  │
                ┌────────▼─────────────────▼──────────────────▼──────┐
                │  PostgreSQL (RW) + Read Replicas │ MongoDB (TS)    │
                │  Redis (cache + queues)          │ S3 (media)      │
                └────────────────────────────────────────────────────┘
```

### 4.2 Microservices

| Service | Stack | Responsibility |
|---|---|---|
| `web-frontend` | Next.js 14, React 19, Tailwind | SSR, marketing, dashboard, PWA shell |
| `api-core` | FastAPI 0.110 (Python 3.11) | Public REST, auth, billing, orchestration |
| `media-svc` | Go 1.22 + ffmpeg | Download, transcode, audio enhancement |
| `transcribe-svc` | Python + WhisperX + pyannote | STT + diarization |
| `ai-svc` | Python + emergentintegrations | Summarization, key-points, chapters |
| `translate-svc` | Python + Claude/GPT + glossary store | Neural translation |
| `moderation-svc` | Python + open-source classifiers | NSFW/hate/PII |
| `notification-svc` | Node.js + ws | Webhooks, email, in-app notifications |
| `worker-fleet` | Celery + RQ + RabbitMQ | Async job execution |

### 4.3 Tech Stack Decisions

- **Frontend.** React 19 + Next.js (App Router) + Tailwind. Why: SEO/SSR for marketing,
  ISR for spec pages, PWA via next-pwa.
- **Backend.** FastAPI (async/await, Pydantic schemas, OpenAPI auto-gen).
- **DB.** PostgreSQL 16 for relational (users, jobs, transactions). MongoDB 7 for
  transcript documents (variable-length). Redis 7 (cache + queue). S3-compatible
  object store for media binaries.
- **Queue.** RabbitMQ 3 with quorum queues for at-least-once delivery.
- **Search.** OpenSearch 2 for transcript full-text + vector embeddings.

---

## 5. Database Schema

### 5.1 PostgreSQL — Relational Core

```sql
-- ============== USERS ==============
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT UNIQUE NOT NULL,
    password_hash   TEXT,                       -- nullable for OAuth-only
    full_name       TEXT,
    avatar_url      TEXT,
    role            user_role NOT NULL DEFAULT 'free',  -- enum: free|pro|enterprise|admin
    plan_id         UUID REFERENCES plans(id),
    mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
    mfa_secret      TEXT,                       -- TOTP secret (encrypted)
    locale          TEXT NOT NULL DEFAULT 'en',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX users_email_lower_idx ON users (LOWER(email));
CREATE INDEX users_plan_idx ON users(plan_id) WHERE deleted_at IS NULL;

-- ============== OAUTH IDENTITIES ==============
CREATE TABLE oauth_identities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,              -- google|github|microsoft
    provider_user_id TEXT NOT NULL,
    access_token    TEXT,
    refresh_token   TEXT,
    expires_at      TIMESTAMPTZ,
    UNIQUE (provider, provider_user_id)
);

-- ============== SESSIONS / REFRESH TOKENS ==============
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    user_agent      TEXT,
    ip_inet         INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_user_idx ON refresh_tokens(user_id);

-- ============== MEDIA FILES ==============
CREATE TABLE media_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    source_type     TEXT NOT NULL,              -- youtube|upload|url
    source_url      TEXT,
    youtube_id      TEXT,
    s3_key          TEXT,                       -- when uploaded
    mime_type       TEXT,
    duration_sec    NUMERIC(10,3),
    size_bytes      BIGINT,
    sha256          TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_user_idx       ON media_files(user_id);
CREATE INDEX media_youtube_id_idx ON media_files(youtube_id);
CREATE INDEX media_metadata_gin   ON media_files USING GIN (metadata);

-- ============== JOBS ==============
CREATE TYPE job_status AS ENUM ('queued','processing','done','failed','cancelled');
CREATE TYPE job_type   AS ENUM ('extract','summarize','translate','download',
                                'transcribe','enhance','moderate','batch');

CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    parent_job_id   UUID REFERENCES jobs(id) ON DELETE CASCADE, -- for batch children
    media_file_id   UUID REFERENCES media_files(id) ON DELETE SET NULL,
    job_type        job_type   NOT NULL,
    status          job_status NOT NULL DEFAULT 'queued',
    priority        SMALLINT   NOT NULL DEFAULT 5, -- 1 high — 9 low
    progress        SMALLINT   NOT NULL DEFAULT 0,
    options         JSONB      NOT NULL DEFAULT '{}'::jsonb,
    result_ref      TEXT,                          -- pointer to MongoDB / S3
    error           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_user_status_idx ON jobs(user_id, status);
CREATE INDEX jobs_status_priority_idx ON jobs(status, priority, created_at)
   WHERE status IN ('queued','processing');
CREATE INDEX jobs_parent_idx ON jobs(parent_job_id);

-- ============== TRANSCRIPTS (relational pointers; payload in MongoDB) ==============
CREATE TABLE transcripts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_file_id   UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
    language        TEXT NOT NULL,
    word_count      INTEGER NOT NULL,
    duration_sec    NUMERIC(10,3) NOT NULL,
    mongo_doc_id    TEXT NOT NULL,                 -- references mongo segments doc
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transcripts_media_idx ON transcripts(media_file_id);

-- ============== TRANSLATIONS ==============
CREATE TABLE translations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id   UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    target_lang     TEXT NOT NULL,
    mongo_doc_id    TEXT NOT NULL,
    word_count      INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transcript_id, target_lang)
);

-- ============== SUMMARIES ==============
CREATE TABLE summaries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id   UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    model           TEXT NOT NULL,
    style           TEXT NOT NULL,
    mongo_doc_id    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== PAYMENTS ==============
CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT UNIQUE NOT NULL,           -- free|pro|enterprise
    price_cents     INTEGER NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'usd',
    interval        TEXT NOT NULL DEFAULT 'month',  -- month|year
    features        JSONB NOT NULL DEFAULT '{}'::jsonb,
    stripe_price_id TEXT
);

CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES plans(id),
    stripe_sub_id   TEXT UNIQUE,
    status          TEXT NOT NULL,                  -- active|past_due|cancelled|trialing
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sub_user_idx ON subscriptions(user_id);

CREATE TABLE payment_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id),
    provider        TEXT NOT NULL,                  -- stripe|paypal
    provider_ref    TEXT NOT NULL,
    amount_cents    INTEGER NOT NULL,
    currency        TEXT NOT NULL,
    status          TEXT NOT NULL,                  -- succeeded|failed|refunded|pending
    invoice_url     TEXT,
    raw             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pay_user_idx     ON payment_transactions(user_id);
CREATE INDEX pay_provider_ref ON payment_transactions(provider, provider_ref);

-- ============== USAGE METERING (usage-based billing) ==============
CREATE TABLE usage_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric          TEXT NOT NULL,                  -- minutes_transcribed | translations | downloads_gb
    quantity        NUMERIC(12,3) NOT NULL,
    job_id          UUID REFERENCES jobs(id),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX usage_user_metric_time_idx
    ON usage_events(user_id, metric, occurred_at DESC);

-- ============== SYSTEM LOGS / AUDIT ==============
CREATE TABLE system_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    target_type     TEXT,
    target_id       TEXT,
    ip_inet         INET,
    user_agent      TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sysLogs_user_time_idx ON system_logs(user_id, created_at DESC);
CREATE INDEX sysLogs_action_idx    ON system_logs(action);
```

### 5.2 MongoDB — Document Payloads

- Collection `transcript_docs`: `{ _id, segments: [...], full_text, language,
  duration_sec, created_at }` — segments are an array of `{index, start, end,
  duration, timestamp, text, speaker?}`.
- Collection `summary_docs`: `{ _id, tldr, key_points, chapters, sentiment, model }`
- Collection `translation_docs`: `{ _id, target_lang, segments, full_text }`

Indexes:
```js
db.transcript_docs.createIndex({ "language": 1, "created_at": -1 })
db.transcript_docs.createIndex({ "full_text": "text" })
db.translation_docs.createIndex({ "target_lang": 1, "created_at": -1 })
```

### 5.3 Referential Integrity

- All cross-table FKs declared `ON DELETE CASCADE | SET NULL` according to data
  ownership rules.
- Soft-delete via `deleted_at` for `users`. Hard-delete reserved for GDPR right-to-be-forgotten.
- Mongo "pointer" fields (`mongo_doc_id`) are validated by application service —
  Postgres remains source of truth for ACL.

---

## 6. REST API Specification

All endpoints are namespaced under `/api`.

### 6.1 Auth

| Method | Path | Body | 200 |
|---|---|---|---|
| `POST` | `/auth/register` | `{email, password, full_name}` | `{user, access_token, refresh_token}` |
| `POST` | `/auth/login` | `{email, password}` | `{access_token, refresh_token}` |
| `POST` | `/auth/refresh` | `{refresh_token}` | `{access_token}` |
| `POST` | `/auth/logout` | – | `204` |
| `GET`  | `/auth/oauth/{provider}/start` | – | redirect |
| `GET`  | `/auth/oauth/{provider}/callback` | code | `{user, tokens}` |
| `POST` | `/auth/mfa/setup` | – | `{otpauth_url}` |
| `POST` | `/auth/mfa/verify` | `{code}` | `{ok:true}` |

### 6.2 Transcript

```http
POST /api/transcript/extract
Authorization: Bearer <token>
Content-Type: application/json

{ "url": "https://www.youtube.com/watch?v=ID11chars", "language": "en" }
```

Response `200`:
```json
{
  "id": "uuid",
  "video_id": "ID11chars",
  "video_url": "https://www.youtube.com/watch?v=ID11chars",
  "thumbnail": "https://img.youtube.com/vi/ID/hqdefault.jpg",
  "title": "Video Title",
  "language": "en",
  "duration": 213.0,
  "word_count": 412,
  "segments": [{"index":0,"start":0.0,"end":3.4,"duration":3.4,"timestamp":"0:00","text":"..."}],
  "full_text": "..."
}
```

| Endpoint | Purpose |
|---|---|
| `POST /transcript/extract` | YouTube → transcript |
| `POST /transcript/summarize` | Transcript → AI summary |
| `POST /transcript/translate` | Transcript → translated text |
| `GET  /transcript/{id}` | Fetch stored transcript |
| `GET  /transcript/{id}/export?format=srt|vtt|ass|txt|json` | Export |
| `GET  /languages` | Supported translation languages |

### 6.3 Media

| Endpoint | Purpose |
|---|---|
| `POST /media/upload` | Multipart upload (≤2GB), virus scan async |
| `POST /media/download` | Download YouTube as MP4/WebM at chosen resolution |
| `POST /media/extract-audio` | Extract MP3/WAV/AAC/FLAC |
| `POST /media/enhance` | Noise reduction + LUFS normalization |
| `POST /media/transcribe` | STT + speaker diarization |

### 6.4 Subtitle Editor

| Endpoint | Purpose |
|---|---|
| `GET    /subtitles/{transcript_id}` | Load editable doc |
| `PATCH  /subtitles/{transcript_id}` | Patch segments (timing, text, style) |
| `POST   /subtitles/{transcript_id}/sync` | Forced alignment auto-sync |
| `GET    /subtitles/{transcript_id}/export?format=srt|vtt|ass` | Download |

### 6.5 Jobs (Batch)

```http
POST /api/jobs/batch
{
  "job_type": "translate",
  "items": [
    {"input_url": "https://youtube.com/watch?v=A...", "options": {"target":"es"}},
    ...up to 1000...
  ],
  "webhook_url": "https://example.com/hook"
}
```
Response: `{ batch_id, child_job_ids: [...] }`

| Endpoint | Purpose |
|---|---|
| `POST /jobs` | Create single job |
| `POST /jobs/batch` | Create up to 1,000 jobs |
| `GET  /jobs` | List jobs (paged, filters: status, type) |
| `GET  /jobs/{id}` | Single job status |
| `DELETE /jobs/{id}` | Cancel queued job |

### 6.6 Billing

| Endpoint | Purpose |
|---|---|
| `GET  /billing/plans` | List plans |
| `POST /billing/checkout` | Create Stripe / PayPal checkout session |
| `POST /billing/webhook/stripe` | Stripe webhook |
| `POST /billing/webhook/paypal` | PayPal webhook |
| `GET  /billing/invoices` | List invoices |
| `POST /billing/refund` | Issue refund (admin only) |

### 6.7 Standard Conventions

- **Auth:** `Authorization: Bearer <jwt>`. JWT carries `sub`, `role`, `plan`, `exp`.
- **Errors:** JSON body `{ "error": { "code", "message", "details" } }`. HTTP codes
  follow RFC 7807 problem-details pattern.
- **Rate Limits:** Sliding-window via Redis. Headers: `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Idempotency:** `Idempotency-Key` header on all `POST` job/billing endpoints.
- **Pagination:** `?cursor=…&limit=…` — opaque cursor returned in `X-Next-Cursor`.
- **Versioning:** `/api/v1/...` once we cut v2. Deprecation policy: 12 months overlap.

---

## 7. Security Requirements

### 7.1 Identity & Access
- **OAuth 2.0** providers: Google, GitHub, Microsoft, Apple, Custom SAML for ENT.
- **JWT** (RS256) access tokens — 15 min TTL. Refresh tokens (opaque, hashed in
  DB) — 30 days, rotating.
- **MFA** TOTP (RFC 6238) + WebAuthn / FIDO2 for ENT.
- **RBAC** roles: `admin`, `enterprise`, `pro`, `free`. Resource ACLs on workspaces.

### 7.2 Transport & Storage
- TLS 1.3 mandatory edge-to-edge. HSTS preloaded.
- All buckets/databases encrypted at rest (AES-256-GCM, KMS-managed keys).
- Refresh tokens, OAuth tokens, MFA secrets stored hashed (Argon2id) /
  envelope-encrypted.

### 7.3 Application Security
- **Input validation:** Pydantic models server-side, Zod schemas client-side.
- **XSS:** React's default escaping + CSP `default-src 'self'; script-src 'self'`.
- **SQLi:** ORM-only DB access (SQLAlchemy / Prisma) with parameterized queries.
- **CSRF:** Double-submit cookie for cookie-based sessions (web) — bearer tokens
  immune for API clients.
- **File uploads:** ClamAV scan before any processing; reject MIME mismatch;
  enforce size limits per plan.
- **Rate limits:** Per-IP + per-user + per-API-key quotas.
- **Dependency scanning:** Snyk / Dependabot on every PR.
- **Secret scanning:** GitGuardian + git pre-commit hooks.
- **CSP / SRI:** Strict CSP, SRI on all CDN-loaded scripts.

### 7.4 Compliance
- **GDPR:** Data subject access (DSAR) + deletion endpoints, EU-only data residency option.
- **SOC 2 Type II** — annual audit, evidence collected via Drata / Vanta.
- **HIPAA** — BAA available for ENT; PHI workloads on isolated cluster.
- **PCI-DSS** — handled by Stripe / PayPal, never store PAN.

---

## 8. Performance & SLO Targets

| SLO | Target |
|---|---|
| Marketing TTFB | < 200 ms (CDN) |
| Marketing FCP / LCP | < 1.5 s / < 2.0 s |
| API p50 latency (read) | < 150 ms |
| API p95 latency (read) | < 500 ms |
| API p99 latency (read) | < 800 ms |
| Transcript extract (cached) | < 200 ms |
| Transcript extract (cold) | < 4 s |
| Summarize (10 min video) | < 8 s |
| Translate (10 min video) | < 6 s |
| Concurrent users | 10,000 |
| Throughput | 5,000 req/s sustained |
| Uptime | 99.9% / quarter |
| RPO / RTO | 5 min / 30 min |

**Strategies:** edge cache transcripts by `(video_id, lang)`, Redis cache hot
endpoints, HTTP/3 + QUIC, CDN for static + signed URLs for media, k8s HPA on CPU
and queue depth, autoscaling worker fleet, read replicas for Postgres, sharded
Mongo for transcript_docs.

---

## 9. Responsive & PWA Specification

| Viewport | Layout |
|---|---|
| **Desktop ≥ 1280px (target 1920×1080)** | 12-col grid, split-pane viewer, sticky sidebar |
| **Tablet 768×1024** | Stacked panes, condensed nav, larger touch targets |
| **Mobile 375×667** | Single column, bottom-sheet players, swipe between Transcript/Summary/Translate |

- All tap targets ≥ 44×44 CSS px.
- PWA manifest, offline read-only mode for cached transcripts.
- Service Worker caches last 50 transcripts client-side (IndexedDB).
- Lighthouse target: ≥ 95 across Perf / A11y / Best-Practices / SEO.

---

## 10. Deployment Architecture

- **Containers:** Docker (multi-stage, distroless base). Kubernetes 1.30 (EKS / GKE).
- **Service mesh:** Istio for mTLS between services.
- **Ingress:** NGINX + Cloudflare (WAF + DDoS).
- **Secrets:** AWS Secrets Manager / GCP Secret Manager + External-Secrets-Operator.
- **CDN:** Cloudflare for marketing & static; CloudFront for signed media URLs.
- **Cache:** Redis 7 cluster (3 shards × 3 replicas).
- **Queue:** RabbitMQ 3 quorum queues, 3 nodes.
- **DB HA:** PostgreSQL 16 with Patroni (1 primary + 2 replicas), MongoDB replica
  set (P-S-S), automated failover.
- **CI/CD:** GitHub Actions → Argo CD GitOps to staging then prod.
- **IaC:** Terraform (cloud) + Helm charts (workloads).
- **Blue/Green** deploys with progressive rollout (Argo Rollouts).
- **Backups:** WAL-G to S3 every 5 min; Mongo PITR; cross-region replicated.

---

## 11. Authentication & Identity

- **Sign-up paths:**
  - Email + password (zxcvbn ≥ 3 score, min 12 chars, no breached passwords via HIBP API)
  - OAuth (Google, GitHub, Microsoft, Apple)
  - SSO / SAML 2.0 (Enterprise)
- **MFA:** TOTP and WebAuthn. Recovery codes generated at setup.
- **Sessions:** Stateless JWT access + opaque refresh in HttpOnly cookie.
- **Password policies:** rolling 90-day rotation for ENT, breach-check on every login.
- **Account lockout:** 10 failed attempts → 15-min cooldown + email alert.
- **Audit log:** All identity events recorded in `system_logs`.

---

## 12. Payments & Billing

- **Providers:** Stripe (primary), PayPal (secondary), in-region cards via Stripe.
- **Models:**
  - **Subscription:** Free / Pro ($19/mo) / Enterprise (custom annual).
  - **Usage-based:** $0.01 / minute transcribed, $0.20 / GB downloaded above plan.
- **Invoices:** Stripe-generated PDFs, mailed via Resend.
- **Refunds:** Admin-only, audit-logged.
- **Tax:** Stripe Tax; VAT, GST, US sales tax automatic.
- **Dunning:** 3-attempt retry over 14 days, then suspension.

---

## 13. Scalability & Capacity Planning

- **Horizontal scaling:** All stateless services scale via HPA (CPU + custom queue
  depth metric). Workers scale on RabbitMQ queue length.
- **Postgres sharding:** `usage_events` sharded by `user_id % N` once > 1 TB.
- **Mongo sharding:** `transcript_docs` sharded by `_id` hash.
- **Caches:** Redis tiered — L1 (in-pod LRU 64MB) + L2 (Redis cluster).
- **CDN:** Cache transcripts, summaries and translations at edge keyed by
  `(video_id, lang, model)` with stale-while-revalidate.
- **Autoscaling triggers:**
  - p95 latency > 500 ms for 2 min → +25% replicas
  - queue depth > 5,000 for 1 min → +1 worker / 1,000 jobs
- **Capacity model (peak):** 10K CCU × 30 req/min ≈ 5K req/s. Provision 20 api-core
  pods × 250 rps headroom.

---

## 14. Testing Strategy

| Layer | Tool | Target |
|---|---|---|
| Unit | pytest (BE), Vitest / RTL (FE) | ≥ 80% line coverage |
| Integration | pytest + testcontainers | All API endpoints, mocked external |
| Contract | Pact | API consumer/provider contracts |
| E2E | Playwright | Top 25 user journeys, every push |
| Load | k6 | 10K CCU sustained 30 min, p95 < 500 ms |
| Chaos | Litmus | Pod kill, network partition, latency injection |
| Security | OWASP ZAP, Burp, Trivy, Snyk | Penetration test every release |
| Accessibility | axe-core | WCAG AA on every page |
| UAT | TestRail + 100 beta users | Sign-off matrix |
| Regression | nightly E2E + visual diffs | Percy / Chromatic |

CI pipeline: lint → unit → integration → E2E (against ephemeral preview env) →
security scan → build images → deploy to staging → smoke tests → manual approval
→ progressive prod rollout.

---

## 15. Implementation Phases & Roadmap

### Phase 1 — Core Infrastructure & Basic Transcription (8 weeks)
- Repo, monorepo (Turborepo), CI/CD, k8s clusters dev/stage/prod
- `api-core` + auth (JWT + Google OAuth)
- `transcript/extract` + storage in Postgres + Mongo
- Marketing site + transcript reader UI
- Observability stack (Prom, Grafana, Loki, Tempo)
- **Exit:** 99% extraction success on top 10K YouTube videos, < 4s cold latency.

### Phase 2 — Advanced Media Tools & Batch (10 weeks)
- `media-svc` (download, audio extraction, enhancement) — Go + ffmpeg
- Subtitle editor + export
- Batch job orchestration (≤ 1,000)
- Speaker-ID transcription (`transcribe-svc`)
- Webhook system + API keys for developers
- **Exit:** Batch of 1,000 jobs completes within 2× single-job latency × ceil(N/parallelism).

### Phase 3 — AI / Translation (8 weeks)
- `ai-svc` (summarize, key-points, chapters)
- `translate-svc` (100+ languages, glossary)
- Streaming responses (SSE)
- Vector index for transcript search (OpenSearch + embeddings)
- Content moderation
- **Exit:** Summarize 10-min video < 8s p95; translate < 6s p95.

### Phase 4 — Payments & Analytics (6 weeks)
- Stripe + PayPal subscription
- Usage-based metering pipeline
- Customer-facing usage dashboards
- Admin/analytics console
- **Exit:** First $1 collected end-to-end with Stripe Tax + invoice.

### Phase 5 — Performance & Production (4 weeks)
- Load test 10K CCU → tune
- Penetration test → fix
- SOC 2 evidence collection
- PWA, offline mode, mobile polish
- Marketing launch
- **Exit:** SLOs met for 4 consecutive weeks; SOC 2 Type I draft.

**Total:** 36 weeks (≈ 9 months) to GA.

---

## 16. Observability & Operations

- **Metrics:** Prometheus + Grafana — RED + USE dashboards per service.
- **Logs:** Loki, structured JSON logs, retention 30 days hot / 1 year cold (S3).
- **Tracing:** OpenTelemetry → Tempo. 100% sample on errors, 5% on success.
- **Alerts:** PagerDuty. SLO burn-rate alerts (1h fast burn, 6h slow burn).
- **Runbooks:** Per alert runbook in repo `/ops/runbooks/`.
- **Game days:** Monthly chaos engineering exercises.
- **Postmortems:** Blameless, 5-day SLA, published internally.

---

## 17. Compliance

- **GDPR:** DSAR endpoint `/api/account/export`, deletion endpoint
  `/api/account/delete`. EU-only residency option for ENT.
- **CCPA / CPRA:** Honored via same endpoints.
- **SOC 2 Type II:** Annual audit. Continuous evidence collection (Drata).
- **HIPAA:** Optional BAA for ENT. PHI workloads on isolated cluster.
- **DMCA:** Take-down workflow for media uploaders.
- **AUP:** Prohibits scraping, copyright infringement, illegal content.

---

## 18. Appendix

### 18.1 Glossary
- **CCU** — Concurrent Users
- **MT** — Machine Translation
- **STT** — Speech-to-Text
- **LUFS** — Loudness Units relative to Full Scale (broadcast loudness)
- **DSAR** — Data Subject Access Request

### 18.2 Reference Implementation (this repository)

This repository ships a working MVP that demonstrates the highest-leverage portion
of the specification:

| Implemented (MVP) | Endpoint |
|---|---|
| YouTube transcript extraction | `POST /api/transcript/extract` |
| AI summarization (TL;DR + key points + chapters + sentiment) | `POST /api/transcript/summarize` |
| Multi-language translation | `POST /api/transcript/translate` |
| Supported languages list | `GET /api/languages` |
| Job model (mocked queue) | `POST /api/jobs`, `GET /api/jobs` |
| Stats | `GET /api/stats` |

The remaining capabilities (downloader, subtitle editor, batch ≤ 1K, speaker-ID
transcription, audio enhancement, content moderation, payments, OAuth, MFA) are
fully specified above and roadmapped in Phases 2-5.

### 18.3 Trademarks & Attribution

YouTube® is a trademark of Google LLC. This product is not affiliated with,
endorsed, or sponsored by YouTube. Transcript data is fetched via publicly
exposed YouTube caption tracks; users are responsible for compliance with
YouTube's Terms of Service for any commercial use of the extracted material.
