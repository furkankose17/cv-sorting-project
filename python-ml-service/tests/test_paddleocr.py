"""
Tests for PaddleOCR integration.

Following TDD: Write failing test first, then implement.
"""

import pytest
import os
from pathlib import Path


# Test fixtures path
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "invoices"


class TestPaddleOCRIntegration:
    """Test PaddleOCR OCR engine integration."""

    def test_paddleocr_engine_available(self):
        """Test that PaddleOCR engine is available and initialized."""
        from app.models.ocr import OCRProcessor

        processor = OCRProcessor(engine="paddleocr")

        # Should use paddleocr engine
        assert processor.engine == "paddleocr"
        assert processor._ocr_available is True
        assert processor._paddle_ocr is not None

    def test_extract_text_from_invoice_image(self):
        """Test extracting text from a sample invoice image using PaddleOCR."""
        from app.models.ocr import OCRProcessor

        # Initialize with PaddleOCR
        processor = OCRProcessor(engine="paddleocr")

        # Load test invoice
        invoice_path = FIXTURES_DIR / "sample_invoice_1.png"
        assert invoice_path.exists(), f"Test invoice not found: {invoice_path}"

        with open(invoice_path, "rb") as f:
            file_content = f.read()

        # Extract text
        result = processor.extract_text(
            file_content=file_content,
            file_type="png",
            language="en"
        )

        # Verify result structure
        assert "text" in result
        assert "confidence" in result
        assert "method" in result
        assert result["method"] == "paddleocr_image"

        # Verify extracted text contains invoice information
        text = result["text"].upper()
        assert "INVOICE" in text
        assert "INV-2025-001" in text
        # Check for total amount - OCR might format as "6,050.00", "6,050.0", or "$6,050"
        assert "6,050" in text or "6050" in text

        # Verify confidence is reasonable
        assert result["confidence"] > 50.0, "Confidence should be > 50% for clear text"

    def test_extract_text_from_multiple_invoices(self):
        """Test extracting text from multiple invoice images."""
        from app.models.ocr import OCRProcessor

        processor = OCRProcessor(engine="paddleocr")

        expected_invoice_numbers = ["INV-2025-001", "INV-2025-002", "INV-2025-003"]

        for i, expected_inv_num in enumerate(expected_invoice_numbers, 1):
            invoice_path = FIXTURES_DIR / f"sample_invoice_{i}.png"
            assert invoice_path.exists()

            with open(invoice_path, "rb") as f:
                file_content = f.read()

            result = processor.extract_text(
                file_content=file_content,
                file_type="png",
                language="en"
            )

            # Verify invoice number is extracted
            assert expected_inv_num in result["text"], \
                f"Expected {expected_inv_num} in extracted text"

    def test_paddleocr_confidence_scores(self):
        """Test that PaddleOCR returns reasonable confidence scores."""
        from app.models.ocr import OCRProcessor

        processor = OCRProcessor(engine="paddleocr")

        invoice_path = FIXTURES_DIR / "sample_invoice_1.png"
        with open(invoice_path, "rb") as f:
            file_content = f.read()

        result = processor.extract_text(
            file_content=file_content,
            file_type="png",
            language="en"
        )

        # PaddleOCR should return confidence as percentage (0-100)
        assert 0 <= result["confidence"] <= 100

        # For clear synthetic images, confidence should be high
        assert result["confidence"] > 80.0

    def test_paddleocr_table_detection(self):
        """Test that PaddleOCR can detect tables in invoice."""
        from app.models.ocr import OCRProcessor

        processor = OCRProcessor(engine="paddleocr", table_detection=True)

        invoice_path = FIXTURES_DIR / "sample_invoice_1.png"
        with open(invoice_path, "rb") as f:
            file_content = f.read()

        result = processor.extract_text(
            file_content=file_content,
            file_type="png",
            language="en"
        )

        # Should detect tables (invoice line items)
        if "tables" in result and result["tables"]:
            tables = result["tables"]
            assert len(tables) > 0
            # First table should have rows and columns
            assert "rows" in tables[0] or "row_count" in tables[0]

    def test_paddleocr_multilingual_support(self):
        """Test PaddleOCR supports multiple languages."""
        from app.models.ocr import OCRProcessor

        processor = OCRProcessor(engine="paddleocr")

        # Verify PaddleOCR supports multiple languages
        engine_info = processor.get_engine_info()
        assert engine_info["engine"] == "paddleocr"

        # PaddleOCR supports 80+ languages
        supported_langs = processor.get_available_languages()
        assert len(supported_langs) > 1
        assert "en" in supported_langs or "english" in supported_langs

    def test_paddleocr_bounding_boxes(self):
        """Test that PaddleOCR returns bounding box information."""
        from app.models.ocr import OCRProcessor

        processor = OCRProcessor(engine="paddleocr")

        invoice_path = FIXTURES_DIR / "sample_invoice_1.png"
        with open(invoice_path, "rb") as f:
            file_content = f.read()

        result = processor.extract_text(
            file_content=file_content,
            file_type="png",
            language="en"
        )

        # PaddleOCR should return line-level data with bounding boxes
        if "lines" in result:
            lines = result["lines"]
            assert len(lines) > 0
            # Each line should have text and bbox
            first_line = lines[0]
            assert "text" in first_line
            assert "bbox" in first_line
            assert len(first_line["bbox"]) >= 4  # At least 4 coordinates


class TestPaddleOCRPerformance:
    """Test PaddleOCR performance characteristics."""

    def test_paddleocr_inference_speed(self):
        """Test that PaddleOCR inference completes in reasonable time."""
        from app.models.ocr import OCRProcessor
        import time

        processor = OCRProcessor(engine="paddleocr")

        invoice_path = FIXTURES_DIR / "sample_invoice_1.png"
        with open(invoice_path, "rb") as f:
            file_content = f.read()

        start_time = time.time()
        result = processor.extract_text(
            file_content=file_content,
            file_type="png",
            language="en"
        )
        elapsed_time = time.time() - start_time

        # Should complete within reasonable time (< 5 seconds for single image)
        assert elapsed_time < 5.0, f"OCR took {elapsed_time:.2f}s, expected < 5s"

        # Check if inference time is tracked
        if "inference_time_ms" in result:
            assert result["inference_time_ms"] > 0


class TestPaddleOCRResourceUsage:
    """Test PaddleOCR resource requirements and usage."""

    def test_paddleocr_memory_usage(self):
        """Test PaddleOCR memory usage stays reasonable."""
        from app.models.ocr import OCRProcessor
        import psutil
        import os

        process = psutil.Process(os.getpid())
        mem_before = process.memory_info().rss / 1024 / 1024  # MB

        processor = OCRProcessor(engine="paddleocr")

        # Process multiple images
        for i in range(1, 4):
            invoice_path = FIXTURES_DIR / f"sample_invoice_{i}.png"
            with open(invoice_path, "rb") as f:
                file_content = f.read()

            processor.extract_text(
                file_content=file_content,
                file_type="png",
                language="en"
            )

        mem_after = process.memory_info().rss / 1024 / 1024  # MB
        mem_increase = mem_after - mem_before

        # Memory increase should be reasonable (< 2GB)
        assert mem_increase < 2000, \
            f"Memory increased by {mem_increase:.0f}MB, expected < 2000MB"
