import logging
import time
from typing import Optional

import httpx


logger = logging.getLogger("emergentintegrations.llm")


class UserMessage:
    def __init__(self, text: str):
        self.text = text


class ImageContent:
    def __init__(self, image_base64: str):
        self.image_base64 = image_base64


class LlmChat:
    BASE_URL = "https://integrations.emergentagent.com/llm"
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0

    def __init__(
        self,
        api_key: str,
        session_id: str = "default",
        system_message: str = "",
        *,
        initial_messages=None,
        custom_headers=None,
        base_url: Optional[str] = None,
        **kwargs,
    ):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self.initial_messages = initial_messages or []
        self.custom_headers = custom_headers or {}
        self.base_url = base_url or self.BASE_URL
        self._kwargs = kwargs
        self._model = None
        self._params = {}

    def with_model(self, provider: str, model: str):
        self._model = model
        return self

    def with_params(self, **params):
        self._params.update(params)
        return self

    async def send_message(self, message: UserMessage):
        if not self.api_key:
            raise RuntimeError("EMERGENT_LLM_KEY is not configured")

        model = self._model
        if not model:
            raise RuntimeError("Model not set. Call .with_model(provider, model) first.")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "content-type": "application/json",
            **self.custom_headers,
        }

        messages = []
        if self.system_message:
            messages.append({"role": "system", "content": self.system_message})
        messages.extend(self.initial_messages)
        messages.append({"role": "user", "content": message.text})

        payload = {
            "model": model,
            "messages": messages,
            **self._params,
        }

        last_exception = None
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                logger.info(
                    "LLM request: provider=openai model=%s attempt=%d/%d",
                    model, attempt, self.MAX_RETRIES
                )
                async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                    response = await client.post(
                        f"{self.base_url}/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    logger.info(
                        "LLM response: status=%d body=%s",
                        response.status_code,
                        response.text[:500],
                    )
                    if response.status_code == 200:
                        data = response.json()
                        return data["choices"][0]["message"]["content"]
                    elif response.status_code >= 500 and attempt < self.MAX_RETRIES:
                        logger.warning(
                            "LLM server error %d, retrying in %.1fs: %s",
                            response.status_code, self.RETRY_DELAY, response.text[:200]
                        )
                        time.sleep(self.RETRY_DELAY * attempt)
                        continue
                    else:
                        raise RuntimeError(
                            f"LLM API error: {response.status_code} - {response.text}"
                        )
            except httpx.TimeoutException as e:
                last_exception = e
                logger.warning(
                    "LLM timeout attempt %d/%d: %s",
                    attempt, self.MAX_RETRIES, e
                )
                if attempt < self.MAX_RETRIES:
                    time.sleep(self.RETRY_DELAY * attempt)
                    continue
            except httpx.HTTPError as e:
                last_exception = e
                logger.warning(
                    "LLM HTTP error attempt %d/%d: %s",
                    attempt, self.MAX_RETRIES, e
                )
                if attempt < self.MAX_RETRIES:
                    time.sleep(self.RETRY_DELAY * attempt)
                    continue

        raise RuntimeError(f"LLM request failed after {self.MAX_RETRIES} attempts: {last_exception}")

    async def send_message_multimodal_response(self, message: UserMessage):
        raise NotImplementedError("Multimodal response is not implemented in this stub.")
