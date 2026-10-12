
import logging
import sqlite3
import uuid
from app_services.ingestion import ingest_pdf
from contextlib import asynccontextmanager, closing, contextmanager
from pathlib import Path

from docling.document_converter import DocumentConverter
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app_services.rag import RAGApplication


# --------------------------------------------------
# Logging
# --------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# --------------------------------------------------
# Database configuration
# --------------------------------------------------

DATABASE_PATH = Path(__file__).resolve().with_name("knowledge.db")

UPLOAD_DIR = Path(__file__).resolve().with_name("uploads")
MAX_FILE_SIZE = 40 * 1024 * 1024  # 40 MB


@contextmanager
def get_db_connection():
    """Open a database connection and close it after use."""
    with closing(sqlite3.connect(DATABASE_PATH)) as connection:
        with connection:
            yield connection


def initialize_database():
    """Create the documents table and add missing columns."""
    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT NOT NULL,
                source_filename TEXT,
                file_path TEXT
            )
            """
        )

        # CREATE TABLE IF NOT EXISTS does not update existing tables.
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(documents)"
            ).fetchall()
        }

        if "source_filename" not in columns:
            connection.execute(
                "ALTER TABLE documents ADD COLUMN source_filename TEXT"
            )

        if "file_path" not in columns:
            connection.execute(
                "ALTER TABLE documents ADD COLUMN file_path TEXT"
            )


# --------------------------------------------------
# FastAPI application lifecycle
# --------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize shared resources and clean them up at shutdown."""
    initialize_database()

    # Initialize RAG lazily when /ask is first called.
    # This avoids loading embedding models for CRUD-only requests.
    app.state.rag = None

    try:
        yield
    finally:
        rag = getattr(app.state, "rag", None)

        if rag is not None:
            try:
                rag.close()
            except Exception:
                logger.exception("Failed to close the RAG service")


app = FastAPI(
    title="AI Knowledge Base API",
    description=(
        "A document management API with PDF extraction "
        "and retrieval-augmented question answering."
    ),
    version="0.2.0",
    lifespan=lifespan,
)


# --------------------------------------------------
# Pydantic models and validation
# --------------------------------------------------

class Document(BaseModel):
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    category: str = Field(min_length=1)

    @field_validator("title", "content", "category")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Field cannot be empty or whitespace")

        return value


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    content: str | None = None
    category: str | None = None



class QuestionRequest(BaseModel):
    """Request body for the RAG question-answering endpoint."""

    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2000)
    document_id: str | None = Field(default=None, max_length=255)

    @field_validator("question")
    @classmethod
    def reject_blank_question(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Question cannot be empty or whitespace")

        return value.strip()

    @field_validator("document_id")
    @classmethod
    def validate_document_id(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()

            if not value:
                raise ValueError("document_id cannot be empty or whitespace")

        return value



class SourceResponse(BaseModel):
    """Metadata for a passage retrieved from Qdrant."""

    document_id: str | None = None
    source_filename: str | None = None
    headings: list[str] = Field(default_factory=list)
    chunk_id: str | None = None
    score: float | None = None



class AskResponse(BaseModel):
    """Response returned by the RAG endpoint."""

    question: str
    answer: str
    sources: list[SourceResponse]


def validate_update_fields(updates: dict):
    """Reject empty PATCH requests and blank or null field values."""
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one field must be provided",
        )

    for field, value in updates.items():
        if value is None or not value.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"{field} cannot be empty or null",
            )


# --------------------------------------------------
# RAG service
# --------------------------------------------------

def get_rag_service(request: Request) -> RAGApplication:
    """
    Return the shared RAG service.

    Create it on the first request and reuse it afterward.
    """
    rag = getattr(request.app.state, "rag", None)

    if rag is None:
        logger.info("Initializing RAG service...")

        try:
            rag = RAGApplication()
            request.app.state.rag = rag

        except Exception as exc:
            logger.exception("Failed to initialize RAG service")

            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "The RAG service is unavailable. "
                    "Check the vector database, embedding model, "
                    "and LM Studio configuration."
                ),
            ) from exc

    return rag


# --------------------------------------------------
# Create a document
# --------------------------------------------------

@app.post(
    "/documents",
    status_code=status.HTTP_201_CREATED,
)
def create_document(document: Document):
    with get_db_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO documents (title, content, category)
            VALUES (?, ?, ?)
            """,
            (document.title, document.content, document.category),
        )

        return {
            "id": cursor.lastrowid,
            "title": document.title,
            "content": document.content,
            "category": document.category,
        }


# --------------------------------------------------
# Retrieve all documents
# --------------------------------------------------

@app.get("/documents")
def get_documents(
    category: str | None = None,
    q: str | None = None,
):
    query = "SELECT * FROM documents WHERE 1=1"
    parameters = []

    if category:
        query += " AND category = ?"
        parameters.append(category)

    if q:
        query += " AND (title LIKE ? OR content LIKE ?)"
        search_term = f"%{q}%"
        parameters.extend([search_term, search_term])

    query += " ORDER BY id"

    with get_db_connection() as connection:
        connection.row_factory = sqlite3.Row

        cursor = connection.execute(query, parameters)
        rows = cursor.fetchall()

        return [dict(row) for row in rows]


# --------------------------------------------------
# Retrieve one document
# --------------------------------------------------

@app.get("/documents/{document_id}")
def get_document(document_id: int):
    with get_db_connection() as connection:
        connection.row_factory = sqlite3.Row

        cursor = connection.execute(
            "SELECT * FROM documents WHERE id = ?",
            (document_id,),
        )

        row = cursor.fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )

        return dict(row)


# --------------------------------------------------
# Replace a document completely (PUT)
# --------------------------------------------------

@app.put("/documents/{document_id}")
def update_document(document_id: int, document: Document):
    with get_db_connection() as connection:
        connection.row_factory = sqlite3.Row

        cursor = connection.execute(
            """
            UPDATE documents
            SET title = ?, content = ?, category = ?
            WHERE id = ?
            """,
            (
                document.title,
                document.content,
                document.category,
                document_id,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )

        cursor = connection.execute(
            "SELECT * FROM documents WHERE id = ?",
            (document_id,),
        )

        return dict(cursor.fetchone())


# --------------------------------------------------
# Partially update a document (PATCH)
# --------------------------------------------------

@app.patch("/documents/{document_id}")
def patch_document(document_id: int, document: DocumentUpdate):
    updates = document.model_dump(exclude_unset=True)
    validate_update_fields(updates)

    with get_db_connection() as connection:
        connection.row_factory = sqlite3.Row

        # Column names come from the fixed Pydantic model.
        fields = ", ".join(f"{field} = ?" for field in updates)
        values = list(updates.values()) + [document_id]

        cursor = connection.execute(
            f"UPDATE documents SET {fields} WHERE id = ?",
            values,
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )

        cursor = connection.execute(
            "SELECT * FROM documents WHERE id = ?",
            (document_id,),
        )

        return dict(cursor.fetchone())


# --------------------------------------------------
# Delete a document
# --------------------------------------------------

@app.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(document_id: int):
    with get_db_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM documents WHERE id = ?",
            (document_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )


# --------------------------------------------------
# Upload and extract a PDF
# --------------------------------------------------


@app.post(
    "/documents/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_pdf(
    request: Request,
    file: UploadFile = File(...),
):
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are supported",
        )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename must end with .pdf",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original_filename = Path(file.filename).name
    saved_filename = f"{uuid.uuid4().hex}.pdf"
    destination = UPLOAD_DIR / saved_filename
    size = 0
    document_id = None

    try:
        # 1. Save the uploaded PDF in chunks.
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)

                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="PDF must be 40 MB or smaller",
                    )

                output.write(chunk)

        # 2. Verify the PDF signature.
        with destination.open("rb") as saved_file:
            if not saved_file.read(5).startswith(b"%PDF-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Uploaded file does not appear to be a PDF",
                )

        # 3. Convert the PDF with Docling.
        converter = DocumentConverter()
        result = converter.convert(destination)
        markdown = result.document.export_to_markdown()

        if not markdown.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No text could be extracted from the PDF",
            )

        # 4. Save the document in SQLite.
        with get_db_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO documents (
                    title,
                    content,
                    category,
                    source_filename,
                    file_path
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    original_filename,
                    markdown,
                    "uploaded",
                    original_filename,
                    str(destination),
                ),
            )

            document_id = cursor.lastrowid

        # 5. Get the shared RAG service.
        rag = get_rag_service(request)

        # 6. Chunk, embed, and index the Docling document.
        chunks_indexed = rag.index_document(
            document=result.document,
            document_id=saved_filename,
            source_filename=original_filename,
        )

        # 7. Return the ingestion summary.
        return {
            "id": document_id,
            "message": "PDF uploaded and indexed successfully",
            "source_filename": original_filename,
            "filename": saved_filename,
            "size_bytes": size,
            "extracted_characters": len(markdown),
            "category": "uploaded",
            "ingestion": {
                "chunks_indexed": chunks_indexed,
                "vector_size": 384,
                "collection": "knowledge_base",
            },
        }

    except Exception as exc:
        # Remove the SQLite record if ingestion fails.
        if document_id is not None:
            try:
                with get_db_connection() as connection:
                    connection.execute(
                        "DELETE FROM documents WHERE id = ?",
                        (document_id,),
                    )
            except Exception:
                logger.exception(
                    "Failed to roll back document %s from SQLite",
                    document_id,
                )

        destination.unlink(missing_ok=True)

        logger.exception("PDF upload or ingestion failed")

        # Preserve expected HTTP validation errors.
        if isinstance(exc, HTTPException):
            raise

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF upload or indexing failed.",
        ) from exc

    finally:
        await file.close()


# --------------------------------------------------
# Ask a question using RAG
# --------------------------------------------------


@app.post("/ask", response_model=AskResponse)
def ask_question(
    payload: QuestionRequest,
    request: Request,
):
    """Answer a question using retrieved document passages."""

    rag = get_rag_service(request)

    try:
        result = rag.ask(
            payload.question,
            document_id=payload.document_id,
        )
        return result

    except Exception as exc:
        logger.exception("RAG request failed")

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to generate an answer right now.",
        ) from exc

