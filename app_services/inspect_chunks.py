import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHUNKS_PATH = PROJECT_ROOT / "output" / "chunks.json"


def main() -> None:
    with CHUNKS_PATH.open(encoding="utf-8") as file:
        chunks = json.load(file)

    token_counts = [chunk["token_count"] for chunk in chunks]
    text_lengths = [len(chunk["text"]) for chunk in chunks]

    short_chunks = [
        chunk for chunk in chunks
        if chunk["token_count"] < 20
    ]

    print("=" * 60)
    print("CHUNK QUALITY REPORT")
    print("=" * 60)
    print(f"Total chunks: {len(chunks)}")
    print(f"Average tokens: {sum(token_counts) / len(token_counts):.1f}")
    print(f"Smallest chunk: {min(token_counts)} tokens")
    print(f"Largest chunk: {max(token_counts)} tokens")
    print(f"Chunks under 20 tokens: {len(short_chunks)}")
    print(f"Average characters: {sum(text_lengths) / len(text_lengths):.1f}")

    print("\nFirst 10 chunks:")
    for chunk in chunks[:10]:
        text = " ".join(chunk["text"].split())
        print(
            f'\n#{chunk["chunk_id"]} | '
            f'{chunk["token_count"]} tokens | '
            f'Headings: {chunk["headings"]}'
        )
        print(text[:300])

    print("\nExamples of chunks under 20 tokens:")
    for chunk in short_chunks[:10]:
        print(
            f'\n#{chunk["chunk_id"]} '
            f'({chunk["token_count"]} tokens): '
            f'{chunk["text"][:200]!r}'
        )


if __name__ == "__main__":
    main()
