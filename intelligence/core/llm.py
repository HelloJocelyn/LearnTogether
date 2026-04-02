from __future__ import annotations

import json
from typing import Any, Dict, List

import httpx

from .config import Settings


def _headers(settings: Settings) -> Dict[str, str]:
  if not settings.openai_api_key:
    raise RuntimeError("OPENAI_API_KEY is not set")
  return {
    "Authorization": f"Bearer {settings.openai_api_key}",
    "Content-Type": "application/json",
  }


def chat_completion(
  settings: Settings,
  messages: List[Dict[str, str]],
  *,
  temperature: float = 0.4,
  response_format_json: bool = False,
) -> str:
  url = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
  body: Dict[str, Any] = {
    "model": settings.llm_model,
    "messages": messages,
    "temperature": temperature,
  }
  if response_format_json:
    body["response_format"] = {"type": "json_object"}
  with httpx.Client(timeout=120.0) as client:
    r = client.post(url, headers=_headers(settings), json=body)
    r.raise_for_status()
    data = r.json()
  return data["choices"][0]["message"]["content"]


def embeddings(settings: Settings, texts: List[str]) -> List[List[float]]:
  url = f"{settings.openai_base_url.rstrip('/')}/embeddings"
  body = {"model": settings.embedding_model, "input": texts}
  with httpx.Client(timeout=120.0) as client:
    r = client.post(url, headers=_headers(settings), json=body)
    r.raise_for_status()
    data = r.json()
  out = [None] * len(texts)
  for item in data["data"]:
    out[item["index"]] = item["embedding"]
  return [x for x in out if x is not None]  # type: ignore[return-value]


def parse_json_maybe(text: str) -> Dict[str, Any]:
  text = text.strip()
  try:
    return json.loads(text)
  except json.JSONDecodeError:
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
      return json.loads(text[start : end + 1])
    raise
