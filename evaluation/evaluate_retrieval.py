
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app_services.rag import RAGApplication


DATASET_PATH = Path(__file__).with_name("questions.json")
TOP_K = 5
TEXT_PREVIEW_LENGTH = 500


def normalize_headings(value) -> list[str]:
    """Normalize heading metadata into a list of strings."""
    if not value:
        return []

    if isinstance(value, str):
        return [value]

    return [str(heading) for heading in value]


def searchable_content(result: dict) -> str:
    """Combine headings and chunk text for relevance matching."""
    headings = normalize_headings(result.get("headings"))
    text = result.get("text") or ""

    return (" ".join(headings) + " " + text).casefold()


def find_relevant_headings(results, expected_headings) -> set[str]:
    """Find expected section names in headings or retrieved text."""
    found = set()

    for result in results:
        content = searchable_content(result)

        for expected in expected_headings:
            if expected.casefold() in content:
                found.add(expected)

    return found


def is_relevant_chunk(result: dict, expected_headings) -> bool:
    """Check whether a chunk contains at least one expected section name."""
    content = searchable_content(result)

    return any(
        expected.casefold() in content
        for expected in expected_headings
    )


def print_retrieved_chunks(results) -> None:
    """Print similarity scores, metadata, and text for debugging."""
    for rank, result in enumerate(results, start=1):
        headings = normalize_headings(result.get("headings"))
        score = result.get("score")
        text = result.get("text") or ""

        print(f"\n  Rank: {rank}")

        if isinstance(score, (int, float)):
            print(f"  Similarity score: {score:.4f}")
        else:
            print("  Similarity score: unavailable")

        print(f"  Document ID: {result.get('document_id')}")
        print(f"  Source filename: {result.get('source_filename')}")
        print(f"  Chunk ID: {result.get('chunk_id')}")
        print(f"  Headings: {headings}")
        print(f"  Text preview: {text[:TEXT_PREVIEW_LENGTH]!r}")

        if len(text) > TEXT_PREVIEW_LENGTH:
            print("  [Text truncated]")


def main() -> None:
    with DATASET_PATH.open("r", encoding="utf-8") as file:
        questions = json.load(file)

    rag = RAGApplication()

    total_relevant_sections = 0
    total_found_sections = 0
    reciprocal_ranks = []
    evaluated_questions = 0

    print(f"Evaluating {len(questions)} questions")
    print(f"Retrieval depth: {TOP_K}")
    print("Detailed chunk output: enabled\n")

    for item in questions:
        question_id = item["id"]
        question = item["question"]
        document_id = item["document_id"]
        expected_headings = set(item["relevant_headings"])

        print("=" * 80)
        print(f"ID: {question_id}")
        print(f"Question: {question}")

        if not expected_headings:
            print(
                "Retrieval metrics: skipped "
                "(no relevant headings labeled)"
            )
            continue

        results = rag.retrieve(
            question=question,
            limit=TOP_K,
            document_id=document_id,
        )

        relevant_found = find_relevant_headings(
            results,
            expected_headings,
        )

        # Find the rank of the first chunk matching an expected
        # heading or mentioning an expected heading in its text.
        first_relevant_rank = next(
            (
                rank
                for rank, result in enumerate(results, start=1)
                if is_relevant_chunk(result, expected_headings)
            ),
            None,
        )

        recall = len(relevant_found) / len(expected_headings)

        # Chunk-level precision: the fraction of retrieved chunks
        # that match at least one expected section name.
        relevant_chunk_count = sum(
            is_relevant_chunk(result, expected_headings)
            for result in results
        )

        precision = (
            relevant_chunk_count / len(results)
            if results
            else 0.0
        )

        reciprocal_rank = (
            1 / first_relevant_rank
            if first_relevant_rank is not None
            else 0.0
        )

        total_relevant_sections += len(expected_headings)
        total_found_sections += len(relevant_found)
        reciprocal_ranks.append(reciprocal_rank)
        evaluated_questions += 1

        print(f"\nExpected headings: {sorted(expected_headings)}")
        print(
            f"Relevant sections found: "
            f"{len(relevant_found)}/{len(expected_headings)}"
        )
        print(f"Recall@{TOP_K}: {recall:.2f}")
        print(f"Precision@{TOP_K}: {precision:.2f}")
        print(f"Reciprocal rank: {reciprocal_rank:.2f}")

        print("\nRetrieved chunks:")
        print_retrieved_chunks(results)
        print()

    print("=" * 80)
    print("RETRIEVAL EVALUATION SUMMARY")
    print("=" * 80)

    if evaluated_questions == 0:
        print("No answerable questions were evaluated.")
        return

    overall_recall = (
        total_found_sections / total_relevant_sections
        if total_relevant_sections
        else 0.0
    )
    mean_reciprocal_rank = (
        sum(reciprocal_ranks) / len(reciprocal_ranks)
    )

    print(f"Questions evaluated: {evaluated_questions}")
    print(f"Expected sections: {total_relevant_sections}")
    print(f"Expected sections retrieved: {total_found_sections}")
    print(f"Overall Recall@{TOP_K}: {overall_recall:.2%}")
    print(f"Mean Reciprocal Rank: {mean_reciprocal_rank:.2f}")
    print(
        "\nLimitations: relevance is determined by literal section-name "
        "matching in headings and chunk text. A matching name does not "
        "guarantee that the chunk actually answers the question."
    )


if __name__ == "__main__":
    main()
