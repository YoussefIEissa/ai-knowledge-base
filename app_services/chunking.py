import hashlib
import json
from pathlib import Path

from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

PDF_PATH = (
    PROJECT_ROOT
    / "uploads"
    / "b63af2a554a44b1eae752c6f57292786.pdf"
)

OUTPUT_DIR = PROJECT_ROOT / "output"
OUTPUT_PATH = OUTPUT_DIR / "chunks.json"

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
MAX_TOKENS = 512


# ---------------------------------------------------------
# PDF conversion and chunking
# ---------------------------------------------------------

def chunk_pdf(pdf_path: Path) -> None:
    """Convert a PDF, create chunks, and save them as JSON."""

    # Validate the input file.
    if not pdf_path.exists():
        raise FileNotFoundError(
            f"PDF not found: {pdf_path.resolve()}"
        )

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("The input file must be a PDF.")

    print(f"Processing PDF: {pdf_path.name}")

    # Step 1: Convert the PDF into a structured Docling document.
    converter = DocumentConverter()
    conversion_result = converter.convert(pdf_path)
    document = conversion_result.document

    print("PDF conversion completed.")

    # Step 2: Initialize Docling's HybridChunker.
    chunker = HybridChunker(
        tokenizer=EMBEDDING_MODEL,
        merge_peers=True,
    )

    # Step 3: Generate chunks.
    docling_chunks = list(chunker.chunk(document))

    print(f"Total chunks created: {len(docling_chunks)}")

    # Step 4: Access the underlying Hugging Face tokenizer.
    tokenizer = chunker.tokenizer.tokenizer

    saved_chunks = []
    oversized_chunks = 0

    # Step 5: Extract chunk text, token counts, and metadata.
    for index, chunk in enumerate(docling_chunks, start=1):
        token_ids = tokenizer(
            chunk.text,
            add_special_tokens=True,
            truncation=False,
        )["input_ids"]

        token_count = len(token_ids)

        if token_count > MAX_TOKENS:
            oversized_chunks += 1

        headings = chunk.meta.headings or []

        # Create a deterministic ID from the filename and position.
        chunk_id = hashlib.sha256(
            f"{pdf_path.name}:{index}".encode("utf-8")
        ).hexdigest()

        saved_chunks.append(
            {
                "chunk_id": chunk_id,
                "document_id": pdf_path.name,
                "text": chunk.text,
                "headings": headings,
                "token_count": token_count,
                "source_filename": pdf_path.name,
            }
        )

    # Step 6: Create the output directory if necessary.
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Step 7: Save all chunks to JSON.
    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(
            saved_chunks,
            file,
            ensure_ascii=False,
            indent=2,
        )

    # Step 8: Print the processing summary.
    print("\n" + "=" * 60)
    print("CHUNKING SUMMARY")
    print("=" * 60)
    print(f"Source PDF: {pdf_path.name}")
    print(f"Total chunks: {len(saved_chunks)}")
    print(f"Oversized chunks: {oversized_chunks}")
    print(f"Within token limit: {len(saved_chunks) - oversized_chunks}")
    print(f"Output file: {OUTPUT_PATH}")
    print("Chunking and JSON export completed successfully.")


# ---------------------------------------------------------
# Entry point
# ---------------------------------------------------------

if __name__ == "__main__":
    chunk_pdf(PDF_PATH)
