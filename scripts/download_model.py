"""Download the local language model.

Run from the project root:

    uv run python scripts/download_model.py

Nothing else in this project downloads the language model. The file
is saved in models/, which is git-ignored. An interrupted download
resumes when the command is run again.
"""
import argparse
import hashlib
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app_services.llm import (
    DEFAULT_MODEL_FILENAME,
    DEFAULT_MODEL_REPO,
    DEFAULT_MODEL_REVISION,
    DEFAULT_MODEL_SHA256,
    DEFAULT_MODEL_SIZE_BYTES,
    MODELS_DIR,
)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while block := file.read(8 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def verify(path: Path) -> bool:
    """Check the downloaded file against the published size and hash."""
    size = path.stat().st_size
    if size != DEFAULT_MODEL_SIZE_BYTES:
        print(
            f"Size mismatch: expected {DEFAULT_MODEL_SIZE_BYTES} bytes, "
            f"found {size}."
        )
        return False

    print("Verifying checksum...")
    if file_sha256(path) != DEFAULT_MODEL_SHA256:
        print("Checksum mismatch: the file is corrupt or was modified.")
        return False

    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download the GGUF language model into models/.",
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="download without asking for confirmation",
    )
    args = parser.parse_args()

    destination = MODELS_DIR / DEFAULT_MODEL_FILENAME
    size_gb = DEFAULT_MODEL_SIZE_BYTES / 1e9

    print(f"Model:       {DEFAULT_MODEL_REPO}")
    print(f"File:        {DEFAULT_MODEL_FILENAME} ({size_gb:.2f} GB)")
    print("License:     Apache-2.0")
    print(f"Source:      https://huggingface.co/{DEFAULT_MODEL_REPO}")
    print(f"Destination: {destination}")

    if destination.is_file():
        print("\nThe file already exists.")
        if verify(destination):
            print("The model is complete. Nothing to download.")
            return 0
        print(f"Delete {destination} and run this command again.")
        return 1

    if not args.yes:
        answer = input(f"\nDownload {size_gb:.2f} GB now? [y/N] ")
        if answer.strip().lower() not in {"y", "yes"}:
            print("Cancelled. Nothing was downloaded.")
            return 1

    from huggingface_hub import hf_hub_download

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        downloaded = hf_hub_download(
            repo_id=DEFAULT_MODEL_REPO,
            filename=DEFAULT_MODEL_FILENAME,
            revision=DEFAULT_MODEL_REVISION,
            local_dir=MODELS_DIR,
        )
    except KeyboardInterrupt:
        print("\nInterrupted. Run the command again to resume.")
        return 1
    except Exception as error:
        print(f"\nDownload failed: {type(error).__name__}: {error}")
        print("Run the command again to resume.")
        return 1

    if not verify(Path(downloaded)):
        print(f"Delete {downloaded} and run this command again.")
        return 1

    print(f"\nModel saved to {downloaded}")
    print("Check it with: uv run python scripts/llm_smoke_test.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
