from pathlib import Path

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
QDRANT_PATH = PROJECT_ROOT / "qdrant_db"

COLLECTION_NAME = "knowledge_base"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

VECTOR_SIZE = 384
DEFAULT_LIMIT = 5


# ---------------------------------------------------------
# Semantic retrieval
# ---------------------------------------------------------

def retrieve_chunks(
    query: str,
    limit: int = DEFAULT_LIMIT,
) -> None:
    """Embed a query and retrieve relevant chunks from Qdrant."""

    # Step 1: Validate the query.
    if not query.strip():
        raise ValueError("Query cannot be empty.")

    if limit < 1:
        raise ValueError("Limit must be at least 1.")

    if not QDRANT_PATH.exists():
        raise FileNotFoundError(
            f"Qdrant database not found: {QDRANT_PATH}"
        )

    # Step 2: Load the embedding model.
    print("Loading embedding model...")
    model = SentenceTransformer(MODEL_NAME)

    # Step 3: Convert the query into a vector.
    query_vector = model.encode(
        query,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    if len(query_vector) != VECTOR_SIZE:
        raise ValueError(
            f"Expected {VECTOR_SIZE} dimensions, "
            f"got {len(query_vector)}."
        )

    print(f"\nQuery: {query}")

    # Step 4: Search Qdrant.
    client = QdrantClient(path=str(QDRANT_PATH))

    try:
        if not client.collection_exists(COLLECTION_NAME):
            raise ValueError(
                f"Collection '{COLLECTION_NAME}' does not exist."
            )

        results = client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector.tolist(),
            limit=limit,
            with_payload=True,
            with_vectors=False,
        ).points

        # Step 5: Display the results.
        if not results:
            print("\nNo matching chunks found.")
            return

        print(f"\nTop {len(results)} results:")
        print("=" * 80)

        for rank, result in enumerate(results, start=1):
            payload = result.payload or {}

            print(f"\nRESULT {rank}")
            print("-" * 80)
            print(f"Score: {result.score:.4f}")
            print(f"Chunk ID: {payload.get('chunk_id', 'Unknown')}")
            print(
                f"Source: "
                f"{payload.get('source_filename', 'Unknown')}"
            )

            headings = payload.get("headings", [])
            print(
                f"Headings: {' > '.join(headings) if headings else 'None'}"
            )

            print("\nText:")
            print(payload.get("text", "No text available."))

        print("\n" + "=" * 80)

    finally:
        client.close()


# ---------------------------------------------------------
# Interactive terminal
# ---------------------------------------------------------

def main() -> None:
    """Allow repeated questions from the terminal."""

    print("=" * 60)
    print("AI KNOWLEDGE BASE: SEMANTIC SEARCH")
    print("Type 'exit' or 'quit' to stop.")
    print("=" * 60)

    while True:
        query = input("\nAsk a question: ").strip()

        if query.lower() in {"exit", "quit"}:
            print("Goodbye!")
            break

        if not query:
            print("Please enter a question.")
            continue

        try:
            retrieve_chunks(query)
        except (ValueError, FileNotFoundError) as error:
            print(f"Error: {error}")


if __name__ == "__main__":
    main()
