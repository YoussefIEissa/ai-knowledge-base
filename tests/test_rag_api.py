
import pytest
from fastapi.testclient import TestClient

import app as app_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create an isolated API client with a temporary SQLite database."""
    monkeypatch.setattr(
        app_module,
        "DATABASE_PATH",
        tmp_path / "test_knowledge.db",
    )

    with TestClient(app_module.app) as test_client:
        yield test_client



class FakeRAG:
    """A predictable RAG service for API tests."""

    def __init__(self):
        self.received_questions = []
        self.received_document_ids = []
        self.closed = False

    def ask(
        self,
        question: str,
        document_id: str | None = None,
    ) -> dict:
        self.received_questions.append(question)
        self.received_document_ids.append(document_id)

        return {
            "question": question,
            "answer": "Query, key, and value vectors support attention.",
            "sources": [
                {
                    "document_id": document_id or "test-document-id",
                    "source_filename": "attention.pdf",
                    "headings": ["Self-Attention"],
                    "chunk_id": "test-chunk-123",
                    "score": 0.85,
                }
            ],
        }

    def close(self):
        self.closed = True



def test_ask_returns_answer_and_sources(client, monkeypatch):
    """A valid question should return the expected JSON structure."""
    fake_rag = FakeRAG()
    monkeypatch.setattr(app_module, "RAGApplication", lambda: fake_rag)

    response = client.post(
        "/ask",
        json={
            "question": "What are query, key, and value vectors?",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["question"] == (
        "What are query, key, and value vectors?"
    )
    assert data["answer"] == (
        "Query, key, and value vectors support attention."
    )
    assert len(data["sources"]) == 1
    assert data["sources"][0]["source_filename"] == "attention.pdf"
    assert data["sources"][0]["headings"] == ["Self-Attention"]
    assert data["sources"][0]["chunk_id"] == "test-chunk-123"
    assert data["sources"][0]["score"] == 0.85

    assert fake_rag.received_questions == [
        "What are query, key, and value vectors?"
    ]


def test_ask_rejects_missing_question(client):
    """A request without a question should return 422."""
    response = client.post("/ask", json={})

    assert response.status_code == 422


def test_ask_rejects_blank_question(client):
    """A whitespace-only question should return 422."""
    response = client.post(
        "/ask",
        json={"question": "    "},
    )

    assert response.status_code == 422


def test_ask_rejects_extra_fields(client):
    """Unexpected request fields should be rejected."""
    response = client.post(
        "/ask",
        json={
            "question": "What is attention?",
            "unexpected": "value",
        },
    )

    assert response.status_code == 422


def test_ask_returns_502_when_generation_fails(client, monkeypatch):
    """An RAG processing failure should not expose internal details."""

    class FailingRAG:
        def ask(self, question: str):
            raise RuntimeError("Internal test failure")

        def close(self):
            pass

    monkeypatch.setattr(
        app_module,
        "RAGApplication",
        FailingRAG,
    )

    response = client.post(
        "/ask",
        json={"question": "What is attention?"},
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to generate an answer right now."
    }
    assert "Internal test failure" not in response.text


def test_rag_service_is_reused(client, monkeypatch):
    """The service should be initialized once and reused across requests."""
    created_services = []

    def create_fake_rag():
        service = FakeRAG()
        created_services.append(service)
        return service

    monkeypatch.setattr(
        app_module,
        "RAGApplication",
        create_fake_rag,
    )

    first_response = client.post(
        "/ask",
        json={"question": "First question?"},
    )
    second_response = client.post(
        "/ask",
        json={"question": "Second question?"},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert len(created_services) == 1
    assert created_services[0].received_questions == [
        "First question?",
        "Second question?",
    ]


def test_ask_passes_document_id_to_rag(client, monkeypatch):
    """A document-specific question should pass its ID to RAG."""
    fake_rag = FakeRAG()
    monkeypatch.setattr(app_module, "RAGApplication", lambda: fake_rag)

    response = client.post(
        "/ask",
        json={
            "question": "What delivery services does Bosta offer?",
            "document_id": "cd9be4c21dd845eb8a3e30e441f8f7c9.pdf",
        },
    )

    assert response.status_code == 200
    assert fake_rag.received_document_ids == [
        "cd9be4c21dd845eb8a3e30e441f8f7c9.pdf"
    ]
    assert response.json()["sources"][0]["document_id"] == (
        "cd9be4c21dd845eb8a3e30e441f8f7c9.pdf"
    )


def test_ask_rejects_blank_document_id(client):
    """A blank document ID should be rejected."""
    response = client.post(
        "/ask",
        json={
            "question": "What delivery services does Bosta offer?",
            "document_id": "   ",
        },
    )

    assert response.status_code == 422
