
import hashlib
import logging
import uuid
from pathlib import Path

from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter
from qdrant_client import models


logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
COLLECTION_NAME = "knowledge_base"
VECTOR_SIZE = 384
BATCH_SIZE = 100


def ingest_pdf(
    pdf_path: Path,
    rag,
    document_id: str,
    source_filename: str,
) -> dict:
    """
    Convert a PDF into chunks, embed them, and index them in Qdrant.

    The existing RAGApplication supplies the shared embedding model
    and Qdrant client. This function does not open another Qdrant
    connection or write shared intermediate JSON files.
    """
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("The input file must be a PDF.")

    logger.info("Starting ingestion for %s", source_filename)

    # 1. Convert the PDF into a structured Docling document.
    converter = DocumentConverter()
    conversion_result = converter.convert(pdf_path)
    document = conversion_result.document

    # 2. Chunk using the same tokenizer as the embedding model.
    chunker = HybridChunker(
        tokenizer=EMBEDDING_MODEL,
        merge_peers=True,
    )
    docling_chunks = list(chunker.chunk(document))

    if not docling_chunks:
        raise ValueError("No chunks could be extracted from the PDF.")

    tokenizer = chunker.tokenizer.tokenizer
    chunks = []

    # 3. Create stable chunk IDs and preserve source metadata.
    for index, chunk in enumerate(docling_chunks, start=1):
        text = chunk.text.strip()

        if not text:
            continue

        token_ids = tokenizer(
            text,
            add_special_tokens=True,
            truncation=False,
        )["input_ids"]

        chunk_id = hashlib.sha256(
            f"{document_id}:{index}:{text}".encode("utf-8")
        ).hexdigest()

        chunks.append(
            {
                "chunk_id": chunk_id,
                "document_id": document_id,
                "source_filename": source_filename,
                "text": text,
                "headings": chunk.meta.headings or [],
                "token_count": len(token_ids),
            }
        )

    if not chunks:
        raise ValueError("The PDF did not contain any non-empty chunks.")

    logger.info("Created %s chunks", len(chunks))

    # 4. Generate normalized embeddings using the shared model.
    embeddings = rag.embedding_model.encode(
        [chunk["text"] for chunk in chunks],
        batch_size=32,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    if len(embeddings) != len(chunks):
        raise RuntimeError("Embedding count does not match chunk count.")

    if embeddings.shape[1] != VECTOR_SIZE:
        raise ValueError(
            f"Expected {VECTOR_SIZE}-dimensional embeddings, "
            f"received {embeddings.shape[1]}."
        )

    # 5. Upsert points into the existing collection.
    # Preserve the original SHA-256 chunk ID in the payload, while
    # converting it to a deterministic UUID for Qdrant's point ID.
    indexed_count = 0

    try:
        for start in range(0, len(chunks), BATCH_SIZE):
            batch_chunks = chunks[start : start + BATCH_SIZE]
            batch_embeddings = embeddings[start : start + BATCH_SIZE]

            points = []

            for chunk, embedding in zip(
                batch_chunks,
                batch_embeddings,
            ):
                qdrant_id = str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        chunk["chunk_id"],
                    )
                )

                points.append(
                    models.PointStruct(
                        id=qdrant_id,
                        vector=embedding.tolist(),
                        payload=chunk,
                    )
                )

            rag.qdrant.upsert(
                collection_name=COLLECTION_NAME,
                points=points,
                wait=True,
            )

            indexed_count += len(points)

    except Exception:
        # Remove any points from this document if a batch fails.
        # Each upload uses a unique document_id, so other documents
        # and the existing book index are unaffected.
        try:
            rag.qdrant.delete(
                collection_name=COLLECTION_NAME,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="document_id",
                                match=models.MatchValue(
                                    value=document_id,
                                ),
                            )
                        ]
                    )
                ),
                wait=True,
            )
        except Exception:
            logger.exception(
                "Failed to clean up partially indexed document %s",
                document_id,
            )

        raise

    summary = {
        "document_id": document_id,
        "source_filename": source_filename,
        "chunks_created": len(chunks),
        "chunks_indexed": indexed_count,
        "vector_size": VECTOR_SIZE,
    }

    logger.info("PDF ingestion completed: %s", summary)

    return summary
