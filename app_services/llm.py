"""Local answer generation with llama.cpp.

The language model runs inside the backend process through
llama-cpp-python. No external model server is needed.

This module only generates text. Retrieval, the prompt, and the
embedding model live in app_services/rag.py.
"""
import logging
import os
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "models"

# The model downloaded by scripts/download_model.py.
DEFAULT_MODEL_REPO = "google/gemma-4-E4B-it-qat-q4_0-gguf"
DEFAULT_MODEL_REVISION = "4b4a2c1d584be7264f87aac328a1bc739ce81b6c"
DEFAULT_MODEL_FILENAME = "gemma-4-E4B_q4_0-it.gguf"
DEFAULT_MODEL_SIZE_BYTES = 5_154_941_280
DEFAULT_MODEL_SHA256 = (
    "676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee"
)

DEFAULT_MODEL_PATH = f"models/{DEFAULT_MODEL_FILENAME}"
DEFAULT_CONTEXT_LENGTH = 8192
DEFAULT_MAX_TOKENS = 1024
DEFAULT_TEMPERATURE = 0.2
DEFAULT_GPU_LAYERS = -1
DEFAULT_TIMEOUT_SECONDS = 120.0

MIN_CONTEXT_LENGTH = 1024
MAX_CONTEXT_LENGTH = 131072

logger = logging.getLogger(__name__)


# ---------------------------------------------------------
# Errors
# ---------------------------------------------------------
class LLMError(Exception):
    """Base class for language model failures."""


class LLMUnavailableError(LLMError):
    """The model cannot be used until the setup is fixed."""


class LLMConfigurationError(LLMUnavailableError):
    """An LLM_* setting is invalid."""


class LLMModelNotFoundError(LLMUnavailableError):
    """The configured model file does not exist."""


class LLMLoadError(LLMUnavailableError):
    """The runtime could not load the model file."""


class LLMTimeoutError(LLMError):
    """The request waited or generated for longer than the time limit."""


class LLMContextOverflowError(LLMError):
    """The prompt does not fit in the configured context window."""


class LLMGenerationError(LLMError):
    """The runtime failed while generating."""


# ---------------------------------------------------------
# Settings
# ---------------------------------------------------------
def _read_int(
    env: Mapping[str, str],
    name: str,
    default: int | None,
    minimum: int,
    maximum: int | None = None,
) -> int | None:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise LLMConfigurationError(
            f"{name} must be a whole number, got {raw!r}."
        ) from None
    if value < minimum or (maximum is not None and value > maximum):
        limit = (
            f"at least {minimum}"
            if maximum is None
            else f"between {minimum} and {maximum}"
        )
        raise LLMConfigurationError(f"{name} must be {limit}, got {value}.")
    return value


def _read_float(
    env: Mapping[str, str],
    name: str,
    default: float,
    minimum: float,
    maximum: float | None = None,
    exclusive_minimum: bool = False,
) -> float:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise LLMConfigurationError(
            f"{name} must be a number, got {raw!r}."
        ) from None
    # "not (value >= minimum)" also rejects NaN.
    too_small = value <= minimum if exclusive_minimum else not value >= minimum
    too_large = maximum is not None and not value <= maximum
    if too_small or too_large or value == float("inf"):
        raise LLMConfigurationError(f"{name} is out of range, got {raw!r}.")
    return value


@dataclass(frozen=True)
class LLMSettings:
    """Validated settings for the local language model."""

    model_path: Path
    context_length: int = DEFAULT_CONTEXT_LENGTH
    max_tokens: int = DEFAULT_MAX_TOKENS
    temperature: float = DEFAULT_TEMPERATURE
    gpu_layers: int = DEFAULT_GPU_LAYERS
    threads: int | None = None
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS

    @classmethod
    def from_env(
        cls,
        env: Mapping[str, str] | None = None,
    ) -> "LLMSettings":
        """Read LLM_* environment variables, applying defaults."""
        if env is None:
            env = os.environ

        raw_path = env.get("LLM_MODEL_PATH", "").strip() or DEFAULT_MODEL_PATH
        model_path = Path(raw_path).expanduser()
        if not model_path.is_absolute():
            # Relative paths are resolved from the project root, so the
            # setting works wherever the server is started from.
            model_path = PROJECT_ROOT / model_path
        if model_path.suffix.lower() != ".gguf":
            raise LLMConfigurationError(
                "LLM_MODEL_PATH must point to a .gguf model file."
            )

        context_length = _read_int(
            env,
            "LLM_CONTEXT_LENGTH",
            DEFAULT_CONTEXT_LENGTH,
            MIN_CONTEXT_LENGTH,
            MAX_CONTEXT_LENGTH,
        )
        max_tokens = _read_int(env, "LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS, 1)
        if max_tokens >= context_length:
            raise LLMConfigurationError(
                f"LLM_MAX_TOKENS ({max_tokens}) must be smaller than "
                f"LLM_CONTEXT_LENGTH ({context_length})."
            )

        return cls(
            model_path=model_path,
            context_length=context_length,
            max_tokens=max_tokens,
            temperature=_read_float(
                env, "LLM_TEMPERATURE", DEFAULT_TEMPERATURE, 0.0, 2.0
            ),
            gpu_layers=_read_int(
                env, "LLM_GPU_LAYERS", DEFAULT_GPU_LAYERS, -1
            ),
            threads=_read_int(env, "LLM_THREADS", None, 1),
            timeout_seconds=_read_float(
                env,
                "LLM_TIMEOUT_SECONDS",
                DEFAULT_TIMEOUT_SECONDS,
                0.0,
                exclusive_minimum=True,
            ),
        )


# ---------------------------------------------------------
# Runtime
# ---------------------------------------------------------
class ChatRuntime(Protocol):
    """The part of llama_cpp.Llama this module uses."""

    def create_chat_completion(self, **kwargs: Any) -> Any: ...

    def close(self) -> None: ...


def load_llama_cpp(settings: LLMSettings) -> ChatRuntime:
    """Load the GGUF model with llama-cpp-python."""
    # Imported here so the native library is only loaded when a model
    # is actually needed.
    import llama_cpp

    logger.info(
        "llama.cpp GPU offload supported by this build: %s",
        llama_cpp.llama_supports_gpu_offload(),
    )
    return llama_cpp.Llama(
        model_path=str(settings.model_path),
        n_ctx=settings.context_length,
        n_gpu_layers=settings.gpu_layers,
        n_threads=settings.threads,
        verbose=False,
    )


# ---------------------------------------------------------
# Local language model
# ---------------------------------------------------------
class LocalLLM:
    """A lazily loaded chat model shared by the whole process.

    The model is loaded on the first generate() call and then reused.
    A llama.cpp context cannot run two generations at once, so calls
    are serialized with a lock; a caller that cannot get a turn within
    the time limit gets LLMTimeoutError.
    """

    def __init__(
        self,
        settings: LLMSettings | None = None,
        runtime_factory: Callable[[LLMSettings], ChatRuntime] = load_llama_cpp,
    ) -> None:
        # With settings=None the environment is read on first use, so a
        # bad LLM_* value cannot break uploads or retrieval.
        self._settings = settings
        self._runtime_factory = runtime_factory
        self._runtime: ChatRuntime | None = None
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._runtime is not None

    def _ensure_loaded(self) -> tuple[LLMSettings, ChatRuntime]:
        """Load the model once. Must be called with the lock held."""
        if self._settings is None:
            self._settings = LLMSettings.from_env()
        settings = self._settings

        if self._runtime is not None:
            return settings, self._runtime

        if not settings.model_path.is_file():
            raise LLMModelNotFoundError(
                f"Model file not found: {settings.model_path}. "
                "Download it with "
                "'uv run python scripts/download_model.py' "
                "or set LLM_MODEL_PATH."
            )

        logger.info(
            "Loading language model %s (context %s, GPU layers %s)",
            settings.model_path.name,
            settings.context_length,
            settings.gpu_layers,
        )
        started = time.monotonic()
        try:
            runtime = self._runtime_factory(settings)
        except Exception as exc:
            raise LLMLoadError(
                f"Could not load {settings.model_path.name}: "
                f"{type(exc).__name__}: {exc}"
            ) from exc

        logger.info(
            "Language model loaded in %.1f s",
            time.monotonic() - started,
        )
        # Only a successful load is remembered, so a missing or broken
        # model can be fixed without restarting the server.
        self._runtime = runtime
        return settings, runtime

    def generate(self, messages: list[dict[str, str]]) -> str:
        """Return the model's reply to a list of chat messages."""
        wait_limit = (
            self._settings.timeout_seconds
            if self._settings is not None
            else LLMSettings.from_env().timeout_seconds
        )
        if not self._lock.acquire(timeout=wait_limit):
            raise LLMTimeoutError(
                "The language model was busy with other requests "
                f"for {wait_limit:g} s."
            )

        try:
            settings, runtime = self._ensure_loaded()
            # Loading is not counted against the generation time limit.
            deadline = time.monotonic() + settings.timeout_seconds
            return self._generate(settings, runtime, messages, deadline)
        finally:
            self._lock.release()

    def _generate(
        self,
        settings: LLMSettings,
        runtime: ChatRuntime,
        messages: list[dict[str, str]],
        deadline: float,
    ) -> str:
        started = time.monotonic()
        parts: list[str] = []
        finish_reason = None
        stream = None

        try:
            # Streaming lets the time limit be checked between tokens.
            stream = runtime.create_chat_completion(
                messages=messages,
                temperature=settings.temperature,
                max_tokens=settings.max_tokens,
                stream=True,
            )
            for chunk in stream:
                choice = chunk["choices"][0]
                text = choice.get("delta", {}).get("content")
                if text:
                    parts.append(text)
                finish_reason = choice.get("finish_reason") or finish_reason

                if time.monotonic() > deadline:
                    raise LLMTimeoutError(
                        "Generation exceeded the time limit of "
                        f"{settings.timeout_seconds:g} s."
                    )
        except LLMError:
            raise
        except ValueError as exc:
            if "exceed context window" in str(exc):
                raise LLMContextOverflowError(
                    "The question and retrieved passages do not fit in "
                    f"the context window of {settings.context_length} "
                    "tokens. Increase LLM_CONTEXT_LENGTH."
                ) from exc
            raise LLMGenerationError(
                f"Generation failed: {type(exc).__name__}"
            ) from exc
        except Exception as exc:
            raise LLMGenerationError(
                f"Generation failed: {type(exc).__name__}"
            ) from exc
        finally:
            # Closing the stream stops llama.cpp from generating further.
            close_stream = getattr(stream, "close", None)
            if close_stream is not None:
                close_stream()

        if finish_reason == "length":
            logger.warning(
                "Answer was cut off at LLM_MAX_TOKENS=%s",
                settings.max_tokens,
            )
        logger.info(
            "Generated an answer in %.1f s",
            time.monotonic() - started,
        )
        return "".join(parts)

    def close(self) -> None:
        """Release the model. It is loaded again if generate() is called."""
        with self._lock:
            runtime, self._runtime = self._runtime, None
            if runtime is not None:
                runtime.close()
