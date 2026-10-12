import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import app as app_module
from unittest.mock import MagicMock, patch


@pytest.fixture
def client(tmp_path, monkeypatch):
    test_database = tmp_path / "test_knowledge.db"

    monkeypatch.setattr(
        app_module,
        "DATABASE_PATH",
        test_database,
    )

    with TestClient(app_module.app) as test_client:
        yield test_client


def test_create_document(client):
    response = client.post(
        "/documents",
        json={
            "title": "Company Refund Policy",
            "content": "Refunds are available within 14 days.",
            "category": "policies",
        },
    )

    assert response.status_code == 201

    data = response.json()
    assert data["id"] == 1
    assert data["title"] == "Company Refund Policy"
    assert data["content"] == "Refunds are available within 14 days."
    assert data["category"] == "policies"


def test_get_documents(client):
    client.post(
        "/documents",
        json={
            "title": "Refund Policy",
            "content": "Refunds are available within 14 days.",
            "category": "policies",
        },
    )

    client.post(
        "/documents",
        json={
            "title": "Installation Guide",
            "content": "Install the application using uv.",
            "category": "technical",
        },
    )

    response = client.get("/documents")

    assert response.status_code == 200

    data = response.json()
    assert len(data) == 2
    assert data[0]["title"] == "Refund Policy"
    assert data[1]["title"] == "Installation Guide"


def test_get_document(client):
    create_response = client.post(
        "/documents",
        json={
            "title": "Python Guide",
            "content": "Python is used for AI engineering.",
            "category": "technical",
        },
    )

    document_id = create_response.json()["id"]

    response = client.get(f"/documents/{document_id}")

    assert response.status_code == 200

    data = response.json()
    assert data["id"] == document_id
    assert data["title"] == "Python Guide"
    assert data["content"] == "Python is used for AI engineering."
    assert data["category"] == "technical"


def test_get_missing_document(client):
    response = client.get("/documents/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Document not found"



def test_update_document(client):
    create_response = client.post(
        "/documents",
        json={
            "title": "Old Title",
            "content": "Old content.",
            "category": "general",
        },
    )

    document_id = create_response.json()["id"]

    response = client.put(
        f"/documents/{document_id}",
        json={
            "title": "Updated Title",
            "content": "Updated content.",
            "category": "technical",
        },
    )

    assert response.status_code == 200

    data = response.json()
    assert data["title"] == "Updated Title"
    assert data["content"] == "Updated content."
    assert data["category"] == "technical"


def test_patch_document(client):
    client.post(
        "/documents",
        json={
            "title": "Original Title",
            "content": "Original content.",
            "category": "general",
        },
    )

    response = client.patch(
        "/documents/1",
        json={"title": "New Title"},
    )

    assert response.status_code == 200

    data = response.json()
    assert data["title"] == "New Title"
    assert data["content"] == "Original content."
    assert data["category"] == "general"



def test_delete_document(client):
    create_response = client.post(
        "/documents",
        json={
            "title": "Temporary Document",
            "content": "This document will be deleted.",
            "category": "general",
        },
    )

    document_id = create_response.json()["id"]

    response = client.delete(f"/documents/{document_id}")

    assert response.status_code == 204
    assert response.content == b""

    # Confirm the document no longer exists.
    get_response = client.get(f"/documents/{document_id}")
    assert get_response.status_code == 404


def test_delete_missing_document(client):
    response = client.delete("/documents/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Document not found"



def test_create_document_missing_field(client):
    response = client.post(
        "/documents",
        json={
            "title": "Incomplete Document",
            "content": "This request has no category.",
        },
    )

    assert response.status_code == 422


def test_patch_document_empty_body(client):
    client.post(
        "/documents",
        json={
            "title": "Python Guide",
            "content": "Learn Python.",
            "category": "technical",
        },
    )

    response = client.patch("/documents/1", json={})

    assert response.status_code == 422
    assert response.json()["detail"] == "At least one field must be provided"


def test_patch_document_empty_string(client):
    client.post(
        "/documents",
        json={
            "title": "Python Guide",
            "content": "Learn Python.",
            "category": "technical",
        },
    )

    response = client.patch(
        "/documents/1",
        json={"title": "   "},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "title cannot be empty or null"




def test_filter_documents_by_category(client):
    client.post(
        "/documents",
        json={
            "title": "Refund Policy",
            "content": "Refunds are available within 14 days.",
            "category": "policies",
        },
    )

    client.post(
        "/documents",
        json={
            "title": "Python Guide",
            "content": "Learn Python for AI engineering.",
            "category": "technical",
        },
    )

    response = client.get("/documents?category=technical")

    assert response.status_code == 200

    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Python Guide"


def test_search_documents(client):
    client.post(
        "/documents",
        json={
            "title": "Refund Policy",
            "content": "Refunds are available within 14 days.",
            "category": "policies",
        },
    )

    client.post(
        "/documents",
        json={
            "title": "Python Guide",
            "content": "Learn Python for AI engineering.",
            "category": "technical",
        },
    )

    response = client.get("/documents?q=refund")

    assert response.status_code == 200

    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Refund Policy"



def test_upload_valid_pdf(client, tmp_path, monkeypatch):
    monkeypatch.setattr(
        app_module,
        "UPLOAD_DIR",
        tmp_path / "uploads",
    )

    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = (
        "# Test PDF\n\nThis is extracted test content."
    )

    with patch("app.DocumentConverter") as mock_converter_class:
        mock_converter_class.return_value.convert.return_value = mock_result

        pdf_content = b"%PDF-1.4\nTest PDF content"

        response = client.post(
            "/documents/upload",
            files={
                "file": (
                    "test.pdf",
                    pdf_content,
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 201

    data = response.json()
    assert data["message"] == "PDF uploaded and processed successfully"
    assert data["source_filename"] == "test.pdf"
    assert data["size_bytes"] == len(pdf_content)
    assert data["extracted_characters"] > 0

    saved_file = tmp_path / "uploads" / data["filename"]
    assert saved_file.exists()
    assert saved_file.read_bytes() == pdf_content



def test_upload_rejects_non_pdf(client, tmp_path, monkeypatch):
    monkeypatch.setattr(
        app_module,
        "UPLOAD_DIR",
        tmp_path / "uploads",
    )

    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "notes.txt",
                b"This is a text file.",
                "text/plain",
            )
        },
    )

    assert response.status_code == 415
    assert not app_module.UPLOAD_DIR.exists()


def test_upload_rejects_invalid_pdf_content(
    client,
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(
        app_module,
        "UPLOAD_DIR",
        tmp_path / "uploads",
    )

    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "fake.pdf",
                b"This is not a PDF.",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 400
    assert list(app_module.UPLOAD_DIR.iterdir()) == []


def test_upload_pdf_extracts_and_stores_markdown(
    client,
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(
        app_module,
        "UPLOAD_DIR",
        tmp_path / "uploads",
    )

    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = (
        "# Refund Policy\n\nRefunds are available within 14 days."
    )

    with patch(
        "app.DocumentConverter"
    ) as mock_converter_class:
        mock_converter_class.return_value.convert.return_value = mock_result

        response = client.post(
            "/documents/upload",
            files={
                "file": (
                    "refund_policy.pdf",
                    b"%PDF-1.4\nFake PDF for testing",
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 201

    data = response.json()
    assert data["source_filename"] == "refund_policy.pdf"
    assert data["extracted_characters"] > 0

    document_response = client.get(f"/documents/{data['id']}")
    assert document_response.status_code == 200

    saved_document = document_response.json()
    assert saved_document["title"] == "refund_policy.pdf"
    assert saved_document["content"] == (
        "# Refund Policy\n\nRefunds are available within 14 days."
    )
    assert saved_document["category"] == "uploaded"
