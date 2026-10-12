from pathlib import Path

from docling.document_converter import DocumentConverter


pdf_path = Path("uploads/b63af2a554a44b1eae752c6f57292786.pdf")

if not pdf_path.is_file():
    raise FileNotFoundError(f"PDF not found: {pdf_path}")

converter = DocumentConverter()
result = converter.convert(pdf_path)

markdown = result.document.export_to_markdown()

output_path = Path("output") / f"{pdf_path.stem}.md"
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(markdown, encoding="utf-8")

print(f"Extracted {len(markdown)} characters")
print(f"Markdown saved to: {output_path}")
print(markdown[:1000])
