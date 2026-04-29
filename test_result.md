#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## LLM API 404 Error - Root Cause Analysis & Resolution (2026-04-28)

### Error Summary
Frontend reported 500 Internal Server Error on `/api/transcript/summarize`.
Backend log showed: `HTTP Request: POST https://integrations.emergentagent.com/llm/anthropic/v1/messages "HTTP/1.1 404 Not Found"`

### Root Causes (Multiple)
1. **Wrong API endpoint**: The original stub called `POST /anthropic/v1/messages` (Anthropic's native endpoint),
   but the Emergent proxy only exposes an OpenAI-compatible `/v1/chat/completions` endpoint.
2. **Wrong SDK design**: The `emergentintegrations` package is built on the OpenAI SDK, NOT the Anthropic SDK.
   All models (Claude, GPT, Gemini) are accessed via `chat.completions.create`, not their native APIs.
3. **Missing `httpx` dependency**: The original stub tried to import `anthropic` package directly and use
   `client.messages.create()` — but `anthropic` was installed in `backend/packages` without the SDK
   properly routing through the Emergent proxy authentication.

### Resolution
Replaced the entire `emergentintegrations/llm/chat.py` stub with a correct implementation:
- **Base URL**: `https://integrations.emergentagent.com/llm` (Emergent proxy, not OpenAI/Anthropic direct)
- **Auth**: `Authorization: Bearer {sk-emergent-e8aF98048F652790cF}` header
- **Endpoint**: `POST /v1/chat/completions` (OpenAI-compatible endpoint used by Emergent proxy)
- **Model names**: `gpt-4o-mini` and `claude-sonnet-4-5-20250929` both work through the proxy
- **Retry logic**: 3 retries with exponential backoff for 5xx errors and timeouts
- **Logging**: Detailed request/response logging via Python `logging` module (logger: `emergentintegrations.llm`)

### Files Changed
- `backend/packages/emergentintegrations/llm/chat.py` - Complete rewrite with correct Emergent proxy routing

### Verified Working
- `gpt-4o-mini` via Emergent proxy: 200 OK, response received
- `claude-sonnet-4-5-20250929` via Emergent proxy: 200 OK, response received

### Notes
- The `sk-emergent-*` key is an Emergent platform key, not an Anthropic API key
- Emergent proxies Anthropic models through their OpenAI-compatible `/v1/chat/completions` endpoint
- Both `anthropic` provider prefix (`.with_model("anthropic", "claude-sonnet-...")`) and
  `openai` prefix (`".with_model("openai", "gpt-4o")"`) work since the Emergent proxy
  handles model routing internally based on the model name string

