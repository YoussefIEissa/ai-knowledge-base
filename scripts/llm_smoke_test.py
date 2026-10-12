"""Optional check that the downloaded language model loads and answers.

Run from the project root, after scripts/download_model.py:

    uv run python scripts/llm_smoke_test.py

This loads the real model, so it needs the model file and enough
memory. It is not part of the pytest suite. It uses the same LLM_*
settings and the same prompt as the API, with one made-up passage, and
does not touch Qdrant, SQLite, or your documents.
"""
import logging
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app_services.llm import LLMError, LLMSettings, LocalLLM
from app_services.rag import RAGApplication

QUESTION = "How long do customers have to request a refund?"
PASSAGES = [
    {
        "source_filename": "smoke-test.pdf",
        "headings": ["Policies", "Refunds"],
        "text": (
            "Customers may request a refund within 14 days of purchase. "
            "Refunds are issued to the original payment method."
        ),
    }
]


def main() -> int:
    logging.basicConfig(level=logging.INFO)

    try:
        settings = LLMSettings.from_env()
    except LLMError as error:
        print(f"Invalid configuration: {error}")
        return 1

    print(f"Model file:     {settings.model_path}")
    print(f"Context length: {settings.context_length}")
    print(f"Max tokens:     {settings.max_tokens}")
    print(f"GPU layers:     {settings.gpu_layers}")

    # Build the real prompt without opening Qdrant or loading the
    # embedding model: generate_answer only needs the language model.
    rag = RAGApplication.__new__(RAGApplication)
    rag.llm = LocalLLM(settings)

    try:
        started = time.monotonic()
        answer = rag.generate_answer(QUESTION, PASSAGES)
        first = time.monotonic() - started

        started = time.monotonic()
        rag.generate_answer(QUESTION, PASSAGES)
        second = time.monotonic() - started
    except LLMError as error:
        print(f"\nFAILED: {type(error).__name__}: {error}")
        return 1
    finally:
        rag.llm.close()

    print(f"\nQuestion: {QUESTION}")
    print(f"Answer:   {answer}")
    print(f"\nFirst answer, including model load: {first:.1f} s")
    print(f"Second answer:                      {second:.1f} s")

    if "[Source 1]" not in answer:
        print("\nWARNING: the answer does not cite [Source 1].")
        return 1

    print("\nOK: the model loaded and answered with a citation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
