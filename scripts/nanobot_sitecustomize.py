import asyncio
import json
import logging
import os
import uuid
from typing import Any

logger = logging.getLogger("nanobot.vertex")

FALLBACK_MODELS = [
    m.strip()
    for m in os.environ.get(
        "NANOBOT_FALLBACK_MODELS",
        "vertex_ai/gemini-3.5-flash,vertex_ai/gemini-3-flash-preview,vertex_ai/gemini-2.5-flash",
    ).split(",")
    if m.strip()
]
MAX_RETRIES = int(os.environ.get("NANOBOT_RETRY_COUNT", "1"))
RETRY_DELAY = float(os.environ.get("NANOBOT_RETRY_DELAY", "1.0"))
REQUEST_TIMEOUT = int(os.environ.get("NANOBOT_REQUEST_TIMEOUT", "30"))
RETRIABLE_PATTERNS = ["503", "429", "ServiceUnavailable", "RateLimitError", "UNAVAILABLE", "overloaded", "high demand", "capacity"]

_patched_litellm = False
_patched_nanobot = False


def _get_llm_key() -> str:
    return (
        os.environ.get("GOOGLE_VERTEX_API_KEY")
        or os.environ.get("VERTEX_API_KEY")
        or os.environ.get("VERTEXAI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or ""
    )


def _strip_vertex_model(model: str | None, default_model: str) -> str:
    value = model or default_model
    for prefix in ("vertex_ai/", "google/"):
        if value.startswith(prefix):
            return value[len(prefix):]
    return value


def _get_value(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _dump_model(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    dump = getattr(obj, "model_dump", None)
    if callable(dump):
        try:
            return dump(mode="json", exclude_none=True)
        except TypeError:
            return dump(exclude_none=True)
    return None


def _content_parts(content: Any) -> list[dict[str, Any]]:
    if content is None:
        return []
    if isinstance(content, str):
        return [{"text": content}]
    if isinstance(content, list):
        parts: list[dict[str, Any]] = []
        for item in content:
            if isinstance(item, str):
                parts.append({"text": item})
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append({"text": text})
                elif item.get("type") == "text" and isinstance(item.get("content"), str):
                    parts.append({"text": item["content"]})
        return parts
    return [{"text": str(content)}]


def _parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _coerce_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    dumped = _dump_model(value)
    if isinstance(dumped, dict):
        return dumped
    try:
        converted = dict(value)
        return converted if isinstance(converted, dict) else {}
    except Exception:
        return {}


def _is_retriable(exc: Exception | None) -> bool:
    if exc is None:
        return False
    text = str(exc).lower()
    if any(pattern.lower() in text for pattern in RETRIABLE_PATTERNS):
        return True
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    try:
        status_int = int(status_code)
    except Exception:
        return False
    return status_int in {408, 409, 429} or status_int >= 500


def _finish_reason(value: Any, has_tool_calls: bool) -> str:
    if has_tool_calls:
        return "tool_calls"
    reason = str(value or "stop").lower().split(".")[-1]
    if reason == "max_tokens":
        return "length"
    return reason or "stop"


def _schema_type_for_vertex(value: str) -> str:
    mapping = {
        "string": "STRING",
        "number": "NUMBER",
        "integer": "INTEGER",
        "boolean": "BOOLEAN",
        "array": "ARRAY",
        "object": "OBJECT",
        "null": "NULL",
    }
    return mapping.get(value.lower(), value.upper())


def _merge_nullable_schema(options: list[Any]) -> tuple[dict[str, Any] | None, bool]:
    schemas = [_schema_for_vertex(option) for option in options]
    dict_schemas = [schema for schema in schemas if isinstance(schema, dict)]
    nullish = any(
        isinstance(schema, dict) and schema.get("type") == "NULL"
        for schema in dict_schemas
    )
    non_null = [
        schema for schema in dict_schemas
        if schema.get("type") != "NULL"
    ]
    if nullish and len(non_null) == 1:
        return non_null[0], True
    return None, False


def _schema_for_vertex(value: Any) -> Any:
    if isinstance(value, list):
        return [_schema_for_vertex(v) for v in value]
    if not isinstance(value, dict):
        return value

    for union_key in ("anyOf", "oneOf"):
        options = value.get(union_key)
        if isinstance(options, list):
            merged, nullable = _merge_nullable_schema(options)
            if merged is not None:
                remainder = {
                    k: v for k, v in value.items()
                    if k not in {union_key, "type"}
                }
                merged.update(_schema_for_vertex(remainder))
                if nullable:
                    merged["nullable"] = True
                return merged

    out: dict[str, Any] = {}
    for key, item in value.items():
        if key in {"additionalProperties", "$schema", "$defs", "definitions", "title", "default", "examples"}:
            continue
        if key == "type":
            if isinstance(item, str):
                out[key] = _schema_type_for_vertex(item)
            elif isinstance(item, list):
                non_null_types = [entry for entry in item if isinstance(entry, str) and entry.lower() != "null"]
                has_null = any(isinstance(entry, str) and entry.lower() == "null" for entry in item)
                out[key] = _schema_type_for_vertex(non_null_types[0]) if non_null_types else "NULL"
                if has_null and non_null_types:
                    out["nullable"] = True
            continue
        if key in {"properties", "items", "anyOf", "oneOf", "allOf"}:
            out[key] = _schema_for_vertex(item)
        else:
            out[key] = _schema_for_vertex(item)
    return out


def _tools_for_vertex(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
    declarations: list[dict[str, Any]] = []
    for tool in tools or []:
        fn = tool.get("function") if isinstance(tool, dict) else None
        if not isinstance(fn, dict):
            fn = tool if isinstance(tool, dict) else None
        if not isinstance(fn, dict) or not fn.get("name"):
            continue
        decl: dict[str, Any] = {
            "name": fn["name"],
            "description": fn.get("description", ""),
        }
        params = fn.get("parameters")
        if isinstance(params, dict):
            decl["parameters"] = _schema_for_vertex(params)
        declarations.append(decl)
    return [{"function_declarations": declarations}] if declarations else None


def _messages_for_vertex(messages: list[dict[str, Any]]) -> tuple[str | None, list[dict[str, Any]]]:
    system_text: list[str] = []
    contents: list[dict[str, Any]] = []
    tool_names_by_id: dict[str, str] = {}

    for msg in messages or []:
        role = msg.get("role")
        if role == "system":
            system_text.extend(part["text"] for part in _content_parts(msg.get("content")) if part.get("text"))
            continue

        if role == "assistant":
            parts = _content_parts(msg.get("content"))
            for tc in msg.get("tool_calls") or []:
                if not isinstance(tc, dict):
                    continue
                raw_part = ((tc.get("extra_content") or {}).get("google_part") if isinstance(tc.get("extra_content"), dict) else None)
                if isinstance(raw_part, dict) and (raw_part.get("function_call") or raw_part.get("functionCall")):
                    parts.append(raw_part)
                else:
                    fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
                    name = str(fn.get("name") or tc.get("name") or "")
                    args = _parse_json_object(fn.get("arguments"))
                    if name:
                        parts.append({"function_call": {"name": name, "args": args}})
                tc_id = tc.get("id")
                fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
                name = fn.get("name") or tc.get("name")
                if isinstance(tc_id, str) and isinstance(name, str):
                    tool_names_by_id[tc_id] = name
            if parts:
                contents.append({"role": "model", "parts": parts})
            continue

        if role == "tool":
            name = msg.get("name") or tool_names_by_id.get(str(msg.get("tool_call_id") or ""))
            if not name:
                name = "tool_response"
            raw_content = msg.get("content")
            response = _parse_json_object(raw_content)
            if not response:
                response = {"content": raw_content if raw_content is not None else ""}
            contents.append({
                "role": "user",
                "parts": [{"function_response": {"name": name, "response": response}}],
            })
            continue

        parts = _content_parts(msg.get("content"))
        if parts:
            contents.append({"role": "user", "parts": parts})

    if not contents:
        contents.append({"role": "user", "parts": [{"text": "(empty)"}]})
    return ("\n\n".join(system_text).strip() or None), contents


class VertexExpressProvider:
    supports_progress_deltas = False

    def __init__(self, api_key: str | None = None, default_model: str = "vertex_ai/gemini-3.5-flash"):
        from nanobot.providers.base import GenerationSettings

        self.api_key = api_key or _get_llm_key()
        self.api_base = None
        self.default_model = default_model
        self.generation = GenerationSettings()
        self._client = None

    def _ensure_client(self):
        if self._client is None:
            from google import genai

            if not self.api_key:
                raise RuntimeError("GOOGLE_VERTEX_API_KEY is not configured")
            self._client = genai.Client(vertexai=True, api_key=self.api_key)
        return self._client

    def _config(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        max_tokens: int,
        temperature: float,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        system_instruction, contents = _messages_for_vertex(messages)
        config: dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max(1, int(max_tokens or 4096)),
            "thinking_config": {"thinking_budget": 0},
        }
        if system_instruction:
            config["system_instruction"] = system_instruction
        vertex_tools = _tools_for_vertex(tools)
        if vertex_tools:
            config["tools"] = vertex_tools
        return contents, config

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        reasoning_effort: str | None = None,
        tool_choice: str | dict[str, Any] | None = None,
    ):
        _ = reasoning_effort, tool_choice
        from nanobot.providers.base import LLMResponse, ToolCallRequest

        contents, config = self._config(messages, tools, max_tokens, temperature)
        model_name = _strip_vertex_model(model, self.default_model)
        client = self._ensure_client()

        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model_name,
            contents=contents,
            config=config,
        )

        text_parts: list[str] = []
        tool_calls: list[Any] = []
        candidates = getattr(response, "candidates", None) or []
        candidate = candidates[0] if candidates else None
        content = getattr(candidate, "content", None) if candidate is not None else None
        parts = getattr(content, "parts", None) if content is not None else []

        for part in parts or []:
            text = getattr(part, "text", None)
            if isinstance(text, str) and text:
                text_parts.append(text)
            fc = getattr(part, "function_call", None) or getattr(part, "functionCall", None)
            if fc is None and isinstance(part, dict):
                fc = part.get("function_call") or part.get("functionCall")
            if fc is None:
                continue
            name = _get_value(fc, "name")
            args = _coerce_dict(_get_value(fc, "args"))
            raw_part = _dump_model(part) or {"function_call": {"name": name, "args": args}}
            tool_calls.append(ToolCallRequest(
                id=f"vx_{uuid.uuid4().hex[:9]}",
                name=str(name),
                arguments=args,
                extra_content={"google_part": raw_part},
            ))

        usage_raw = getattr(response, "usage_metadata", None)
        usage = _dump_model(usage_raw) or {}
        return LLMResponse(
            content="".join(text_parts) or getattr(response, "text", None),
            tool_calls=tool_calls,
            finish_reason=_finish_reason(getattr(candidate, "finish_reason", None), bool(tool_calls)),
            usage={k: int(v) for k, v in usage.items() if isinstance(v, int)},
        )

    async def chat_stream(
        self,
        *args: Any,
        on_content_delta=None,
        on_thinking_delta=None,
        on_tool_call_delta=None,
        **kwargs: Any,
    ):
        _ = on_thinking_delta, on_tool_call_delta
        response = await self.chat(*args, **kwargs)
        if on_content_delta and response.content:
            await on_content_delta(response.content)
        return response

    async def _retry_wait(self, model: str, attempt: int, on_retry_wait=None) -> None:
        delay = RETRY_DELAY * (2 ** attempt)
        message = f"Vertex AI retry for {model} in {delay:.1f}s"
        logger.warning("[Vertex] %s", message)
        if on_retry_wait:
            await on_retry_wait(message)
        await asyncio.sleep(delay)

    async def _with_retry_and_fallback(self, call, kwargs: dict[str, Any], on_retry_wait=None):
        primary = kwargs.get("model") or self.default_model
        candidates: list[str] = []
        for candidate in [primary, *FALLBACK_MODELS]:
            if candidate and candidate not in candidates:
                candidates.append(candidate)

        last_err: Exception | None = None
        for index, candidate in enumerate(candidates):
            model_kwargs = dict(kwargs)
            model_kwargs["model"] = candidate
            for attempt in range(MAX_RETRIES + 1):
                try:
                    return await call(**model_kwargs)
                except Exception as exc:
                    last_err = exc
                    if not _is_retriable(exc):
                        break
                    if attempt < MAX_RETRIES:
                        await self._retry_wait(candidate, attempt, on_retry_wait=on_retry_wait)
            if index + 1 < len(candidates):
                logger.warning("[Vertex] %s failed. Trying fallback: %s", candidate, candidates[index + 1])

        from nanobot.providers.base import LLMResponse

        return LLMResponse(
            content=f"Error calling Vertex AI: {last_err}",
            finish_reason="error",
            error_should_retry=_is_retriable(last_err),
        )

    async def chat_with_retry(self, *args: Any, **kwargs: Any):
        on_retry_wait = kwargs.pop("on_retry_wait", None)
        kwargs.pop("retry_mode", None)
        if args:
            kwargs["messages"] = args[0]
        return await self._with_retry_and_fallback(self.chat, kwargs, on_retry_wait=on_retry_wait)

    async def chat_stream_with_retry(self, *args: Any, **kwargs: Any):
        on_retry_wait = kwargs.pop("on_retry_wait", None)
        kwargs.pop("retry_mode", None)
        if args:
            kwargs["messages"] = args[0]
        return await self._with_retry_and_fallback(self.chat_stream, kwargs, on_retry_wait=on_retry_wait)

    def get_default_model(self) -> str:
        return self.default_model


def _apply_litellm_patch() -> None:
    global _patched_litellm
    if _patched_litellm:
        return
    try:
        import litellm
    except ImportError:
        return

    original = litellm.acompletion
    retriable = []
    try:
        from litellm.exceptions import ServiceUnavailableError, RateLimitError, Timeout, APIConnectionError
        retriable.extend([ServiceUnavailableError, RateLimitError, Timeout, APIConnectionError])
    except ImportError:
        pass

    def is_retriable(exc):
        for t in retriable:
            if isinstance(exc, t):
                return True
        return any(p in str(exc) for p in RETRIABLE_PATTERNS)

    async def fallback(*args, **kwargs):
        if "timeout" not in kwargs:
            kwargs["timeout"] = REQUEST_TIMEOUT
        model = kwargs.get("model", args[0] if args else "unknown")
        last_err = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                return await original(*args, **kwargs)
            except Exception as e:
                last_err = e
                if not is_retriable(e):
                    raise
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY * (2 ** attempt)
                    logger.warning("[Fallback] %s attempt %s failed: %s. Retry in %.1fs...", model, attempt + 1, type(e).__name__, delay)
                    await asyncio.sleep(delay)

        for fb in FALLBACK_MODELS:
            if fb == model:
                continue
            try:
                logger.warning("[Fallback] %s exhausted. Trying: %s", model, fb)
                kwargs["model"] = fb
                return await original(*args, **kwargs)
            except Exception as e:
                logger.warning("[Fallback] %s failed: %s", fb, type(e).__name__)
                last_err = e
                if not is_retriable(e):
                    raise
        raise last_err

    litellm.acompletion = fallback
    litellm.request_timeout = REQUEST_TIMEOUT
    _patched_litellm = True


def _apply_nanobot_vertex_patch() -> None:
    global _patched_nanobot
    if _patched_nanobot:
        return
    try:
        import nanobot.providers.factory as factory
    except ImportError:
        return

    original = factory._make_provider_core

    def patched_make_provider_core(config, *, preset_name=None, preset=None, model=None):
        resolved = factory._resolve_model_preset(config, preset_name=preset_name, preset=preset)
        target_model = model or resolved.model
        provider_name = getattr(resolved, "provider", "auto")
        if str(target_model).startswith("vertex_ai/") or provider_name == "vertex_ai":
            provider = VertexExpressProvider(api_key=_get_llm_key(), default_model=target_model)
            provider.generation = resolved.to_generation_settings()
            return provider
        return original(config, preset_name=preset_name, preset=preset, model=model)

    factory._make_provider_core = patched_make_provider_core
    _patched_nanobot = True
    logger.info("[Vertex] Patched Nanobot provider factory for vertex_ai/* models")


def _apply_patches() -> None:
    _apply_litellm_patch()
    _apply_nanobot_vertex_patch()


_apply_patches()

if not _patched_nanobot:
    import importlib

    _orig_import_module = importlib.import_module

    def _hooked_import_module(name, *args, **kwargs):
        mod = _orig_import_module(name, *args, **kwargs)
        if name in {"nanobot.providers.factory", "litellm"}:
            _apply_patches()
        return mod

    importlib.import_module = _hooked_import_module
