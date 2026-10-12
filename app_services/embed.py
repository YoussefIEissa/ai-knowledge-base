import json
from pathlib import Path

from sentence_transformers import SentenceTransformer


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INPUT_PATH = PROJECT_ROOT / "output" / "chunks.json"
OUTPUT_PATH = PROJECT_ROOT / "output" / "embedded_chunks.json"

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
BATCH_SIZE = 32


# ---------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------

def embed_chunks() -> None:
    """Generate embeddings for chunks and save them as JSON."""

    # Step 1: Validate and load the input file.
    if not INPUT_PATH.exists():
        raise FileNotFoundError(
            f"Chunks file not found: {INPUT_PATH}"
        )

    with INPUT_PATH.open("r", encoding="utf-8") as file:
        chunks = json.load(file)

    if not isinstance(chunks, list) or not chunks:
        raise ValueError("The chunks file must contain a non-empty list.")

    for index, chunk in enumerate(chunks):
        if not isinstance(chunk.get("text"), str) or not chunk["text"].strip():
            raise ValueError(f"Chunk at index {index} has empty text.")

    print(f"Loaded {len(chunks)} chunks.")

    # Step 2: Load the embedding model.
    print(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)

    print(f"Embedding dimension: {model.get_sentence_embedding_dimension()}")

    # Step 3: Extract text and generate embeddings in batches.
    texts = [chunk["text"] for chunk in chunks]

    embeddings = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    # Step 4: Preserve metadata and attach each embedding.
    embedded_chunks = []

    for chunk, embedding in zip(chunks, embeddings):
        embedded_chunks.append(
            {
                **chunk,
                "embedding": embedding.tolist(),
            }
        )

    # Step 5: Save the output.
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(
            embedded_chunks,
            file,
            ensure_ascii=False,
        )

    # Step 6: Report results.
    print("\n" + "=" * 60)
    print("EMBEDDING SUMMARY")
    print("=" * 60)
    print(f"Chunks embedded: {len(embedded_chunks)}")
    print(f"Vector dimensions: {len(embeddings[0])}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Normalized vectors: True")
    print(f"Output file: {OUTPUT_PATH}")
    print("Embedding generation completed successfully.")


# ---------------------------------------------------------
# Entry point
# ---------------------------------------------------------

if __name__ == "__main__":
    embed_chunks()
