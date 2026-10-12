import json
import uuid
from pathlib import Path

from qdrant_client import QdrantClient, models


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INPUT_PATH = PROJECT_ROOT / "output" / "embedded_chunks.json"
QDRANT_PATH = PROJECT_ROOT / "qdrant_db"

COLLECTION_NAME = "knowledge_base"
VECTOR_SIZE = 384
BATCH_SIZE = 100


# ---------------------------------------------------------
# Vector database indexing
# ---------------------------------------------------------

def index_chunks() -> None:
    """Store embedded document chunks in persistent Qdrant."""

    # Step 1: Load embedded chunks.
    if not INPUT_PATH.exists():
        raise FileNotFoundError(
            f"Embedded chunks file not found: {INPUT_PATH}"
        )

    with INPUT_PATH.open("r", encoding="utf-8") as file:
        chunks = json.load(file)

    if not isinstance(chunks, list) or not chunks:
        raise ValueError(
            "The embedded chunks file is empty or invalid."
        )

    print(f"Loaded {len(chunks)} embedded chunks.")

    # Step 2: Validate chunk IDs and vectors.
    seen_ids = set()

    for index, chunk in enumerate(chunks):
        chunk_id = chunk.get("chunk_id")
        vector = chunk.get("embedding")

        if not isinstance(chunk_id, str) or not chunk_id:
            raise ValueError(
                f"Chunk {index} has an invalid chunk_id."
            )

        if chunk_id in seen_ids:
            raise ValueError(
                f"Duplicate chunk ID: {chunk_id}"
            )

        seen_ids.add(chunk_id)

        if (
            not isinstance(vector, list)
            or len(vector) != VECTOR_SIZE
        ):
            raise ValueError(
                f"Chunk {chunk_id} must have a "
                f"{VECTOR_SIZE}-dimensional vector."
            )

        if not all(
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and value == value
            and abs(value) != float("inf")
            for value in vector
        ):
            raise ValueError(
                f"Chunk {chunk_id} contains an invalid vector value."
            )

        if (
            not isinstance(chunk.get("text"), str)
            or not chunk["text"].strip()
        ):
            raise ValueError(
                f"Chunk {chunk_id} has empty text."
            )

        if not isinstance(chunk.get("document_id"), str):
            raise ValueError(
                f"Chunk {chunk_id} has an invalid document_id."
            )

        if not isinstance(chunk.get("source_filename"), str):
            raise ValueError(
                f"Chunk {chunk_id} has an invalid source_filename."
            )

        if not isinstance(chunk.get("token_count"), int):
            raise ValueError(
                f"Chunk {chunk_id} has an invalid token_count."
            )

    # Step 3: Open a persistent local Qdrant database.
    QDRANT_PATH.mkdir(parents=True, exist_ok=True)

    client = QdrantClient(path=str(QDRANT_PATH))

    try:
        # Step 4: Create the collection if it doesn't exist.
        if not client.collection_exists(COLLECTION_NAME):
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=VECTOR_SIZE,
                    distance=models.Distance.COSINE,
                ),
            )

            print(f"Created collection: {COLLECTION_NAME}")

        else:
            # Validate the existing collection configuration.
            collection_info = client.get_collection(
                COLLECTION_NAME
            )
            vector_config = (
                collection_info.config.params.vectors
            )

            if not isinstance(
                vector_config, models.VectorParams
            ):
                raise ValueError(
                    "The existing collection does not use "
                    "a single dense vector."
                )

            if vector_config.size != VECTOR_SIZE:
                raise ValueError(
                    f"Existing collection uses "
                    f"{vector_config.size} dimensions, "
                    f"but expected {VECTOR_SIZE}."
                )

            if vector_config.distance != models.Distance.COSINE:
                raise ValueError(
                    "Existing collection does not use cosine distance."
                )

            print(
                f"Using existing collection: {COLLECTION_NAME}"
            )

        # Step 5: Upload chunks in batches.
        for start in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[start : start + BATCH_SIZE]

            points = []

            for chunk in batch:
                # Qdrant accepts UUIDs or unsigned integer IDs.
                # Keep the original SHA-256 ID in the payload.
                qdrant_id = str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        chunk["chunk_id"],
                    )
                )

                points.append(
                    models.PointStruct(
                        id=qdrant_id,
                        vector=chunk["embedding"],
                        payload={
                            "chunk_id": chunk["chunk_id"],
                            "document_id": chunk["document_id"],
                            "source_filename": chunk["source_filename"],
                            "text": chunk["text"],
                            "headings": chunk.get("headings", []),
                            "token_count": chunk["token_count"],
                        },
                    )
                )

            client.upsert(
                collection_name=COLLECTION_NAME,
                points=points,
                wait=True,
            )

            indexed_count = min(
                start + len(batch),
                len(chunks),
            )

            print(
                f"Indexed {indexed_count}/{len(chunks)} chunks."
            )

        # Step 6: Verify the collection count.
        collection_info = client.get_collection(
            COLLECTION_NAME
        )

        stored_points = collection_info.points_count

        print("\n" + "=" * 60)
        print("QDRANT INDEXING SUMMARY")
        print("=" * 60)
        print(f"Collection: {COLLECTION_NAME}")
        print(f"Expected points: {len(chunks)}")
        print(f"Stored points: {stored_points}")
        print(f"Vector size: {VECTOR_SIZE}")
        print("Distance: Cosine")
        print(f"Database path: {QDRANT_PATH}")

        if stored_points != len(chunks):
            raise RuntimeError(
                "The number of stored points does not match "
                "the input. Check whether the collection contains "
                "unrelated points or stale data."
            )

        print(
            "Indexing and verification completed successfully."
        )

    finally:
        client.close()


# ---------------------------------------------------------
# Entry point
# ---------------------------------------------------------

if __name__ == "__main__":
    index_chunks()
