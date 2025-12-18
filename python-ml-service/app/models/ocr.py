"""
OCR Processor for CV Sorting ML Service.
Uses RapidOCR as primary engine with Tesseract as fallback.
Optimized for CV/resume document processing with high accuracy.
"""

import io
import logging
import os
import hashlib
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)


class OCRProcessor:
    """
    Optimized OCR processor using RapidOCR (primary) or Tesseract (fallback).
    Supports PDF, PNG, JPG, TIFF, and other image formats.

    RapidOCR advantages:
    - 3-5x faster than PaddleOCR on CPU
    - Excellent handling of both clean and scanned documents
    - Built-in multilingual support (EN, DE, TR, FR, ES, etc.)
    - Lower memory footprint (~500MB vs 2GB+)
    - No GPU required for good performance
    """

    SUPPORTED_FORMATS = {
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',
        'bmp': 'image/bmp',
        'gif': 'image/gif',
        'webp': 'image/webp'
    }

    # Language mapping for RapidOCR (auto-detects, but useful for Tesseract fallback)
    LANGUAGE_MAP = {
        'en': 'eng',
        'eng': 'eng',
        'german': 'deu',
        'deu': 'deu',
        'de': 'deu',
        'turkish': 'tur',
        'tur': 'tur',
        'tr': 'tur',
        'french': 'fra',
        'fra': 'fra',
        'fr': 'fra',
        'spanish': 'spa',
        'spa': 'spa',
        'es': 'spa',
    }

    def __init__(
        self,
        engine: Optional[str] = None,
        tesseract_cmd: Optional[str] = None,
        poppler_path: Optional[str] = None,
        default_language: str = "en",
        # RapidOCR optimization settings
        det_db_thresh: float = 0.3,  # Detection threshold (lower = more sensitive)
        det_db_box_thresh: float = 0.5,  # Box threshold
        det_db_unclip_ratio: float = 1.6,  # Unclip ratio for text regions
        rec_batch_num: int = 6,  # Recognition batch size
        use_det: bool = True,
        use_cls: bool = True,
        use_rec: bool = True,
        # Image preprocessing
        apply_preprocessing: bool = True,
        contrast_factor: float = 1.3,
        sharpness_factor: float = 1.2,
        # Table detection
        table_detection: bool = True,
    ):
        """
        Initialize OCR processor with optimized settings for CV processing.

        Args:
            engine: OCR engine to use ('rapidocr' or 'tesseract')
            tesseract_cmd: Path to tesseract executable (for fallback)
            poppler_path: Path to poppler binaries (for PDF conversion)
            default_language: Default OCR language
            det_db_thresh: Text detection threshold (0.1-0.9, lower=more sensitive)
            det_db_box_thresh: Box detection threshold
            det_db_unclip_ratio: Expansion ratio for detected text regions
            rec_batch_num: Batch size for recognition (higher=faster but more memory)
            use_det: Enable text detection
            use_cls: Enable text direction classification
            use_rec: Enable text recognition
            apply_preprocessing: Apply image preprocessing for better accuracy
            contrast_factor: Contrast enhancement factor
            sharpness_factor: Sharpness enhancement factor
            table_detection: Enable table structure detection
        """
        self.engine = engine or os.getenv("OCR_ENGINE", "rapidocr")
        self.default_language = default_language
        self.poppler_path = poppler_path
        self.table_detection = table_detection

        # RapidOCR optimization parameters
        self.det_db_thresh = det_db_thresh
        self.det_db_box_thresh = det_db_box_thresh
        self.det_db_unclip_ratio = det_db_unclip_ratio
        self.rec_batch_num = rec_batch_num
        self.use_det = use_det
        self.use_cls = use_cls
        self.use_rec = use_rec

        # Preprocessing settings
        self.apply_preprocessing = apply_preprocessing
        self.contrast_factor = contrast_factor
        self.sharpness_factor = sharpness_factor

        # Engine instances
        self._rapid_ocr = None
        self._tesseract_available = False

        # Initialize the selected engine
        if self.engine == "rapidocr":
            self._init_rapidocr()
        else:
            self._init_tesseract(tesseract_cmd)

    def _init_rapidocr(self):
        """Initialize RapidOCR engine with optimized settings."""
        try:
            from rapidocr_onnxruntime import RapidOCR

            logger.info("Initializing RapidOCR with optimized settings...")

            # Initialize with optimized parameters for CV processing
            self._rapid_ocr = RapidOCR(
                det_db_thresh=self.det_db_thresh,
                det_db_box_thresh=self.det_db_box_thresh,
                det_db_unclip_ratio=self.det_db_unclip_ratio,
                rec_batch_num=self.rec_batch_num,
                use_det=self.use_det,
                use_cls=self.use_cls,
                use_rec=self.use_rec,
            )

            logger.info("RapidOCR initialized successfully with optimized settings")
            logger.info(f"  - Detection threshold: {self.det_db_thresh}")
            logger.info(f"  - Box threshold: {self.det_db_box_thresh}")
            logger.info(f"  - Recognition batch size: {self.rec_batch_num}")

        except ImportError:
            logger.warning("RapidOCR not available, falling back to Tesseract")
            self.engine = "tesseract"
            self._init_tesseract(None)
        except Exception as e:
            logger.warning(f"RapidOCR initialization failed: {e}, falling back to Tesseract")
            self.engine = "tesseract"
            self._init_tesseract(None)

    def _init_tesseract(self, tesseract_cmd: Optional[str]):
        """Initialize Tesseract OCR (fallback engine)."""
        try:
            import pytesseract
            from PIL import Image

            if tesseract_cmd:
                pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

            version = pytesseract.get_tesseract_version()
            logger.info(f"Tesseract version: {version}")
            self._tesseract_available = True
        except Exception as e:
            logger.warning(f"Could not verify Tesseract installation: {e}")
            self._tesseract_available = False

    def extract_text(
        self,
        file_content: bytes,
        file_type: str,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract text from a document with optimized processing.

        Args:
            file_content: Binary file content
            file_type: File type (pdf, png, jpg, etc.)
            language: OCR language code (en, german, turkish, etc.)

        Returns:
            Dict with extracted text, confidence, and metadata
        """
        file_type = file_type.lower().replace('.', '')
        language = language or self.default_language

        if file_type not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported file type: {file_type}. Supported: {list(self.SUPPORTED_FORMATS.keys())}")

        logger.info(f"Processing {file_type} file with engine: {self.engine}")

        if file_type == 'pdf':
            return self._process_pdf(file_content, language)
        else:
            return self._process_image(file_content, language)

    def _process_pdf(
        self,
        content: bytes,
        language: str,
    ) -> Dict[str, Any]:
        """
        Process PDF document with optimized settings.

        Args:
            content: PDF file content
            language: OCR language

        Returns:
            Extraction result
        """
        from pdf2image import convert_from_bytes

        logger.info("Converting PDF to images...")

        try:
            # Use higher DPI for better accuracy on CVs
            images = convert_from_bytes(
                content,
                poppler_path=self.poppler_path,
                dpi=200,  # Higher DPI for better text quality
                fmt='png',
                grayscale=False,  # Keep color for better detection
            )
        except Exception as e:
            logger.warning(f"PDF conversion with DPI 200 failed: {e}, trying lower DPI")
            images = convert_from_bytes(
                content,
                poppler_path=self.poppler_path,
                dpi=150,
                fmt='png',
            )

        logger.info(f"PDF has {len(images)} pages")

        # Capture first page as preview image for frontend highlighting
        preview_image = None
        preview_dimensions = None
        if images:
            first_page = images[0]
            preview_dimensions = {"width": first_page.width, "height": first_page.height}
            # Convert to base64 PNG for frontend display
            preview_buffer = io.BytesIO()
            first_page.save(preview_buffer, format='PNG', optimize=True)
            preview_buffer.seek(0)
            import base64
            preview_image = base64.b64encode(preview_buffer.getvalue()).decode('utf-8')
            logger.info(f"Generated preview image: {first_page.width}x{first_page.height}")

        texts = []
        confidences = []
        page_results = []
        all_lines = []

        for i, image in enumerate(images):
            logger.debug(f"Processing page {i + 1}/{len(images)}")

            if self._rapid_ocr:
                page_result = self._ocr_with_rapid(image, language)
            else:
                page_result = self._ocr_with_tesseract(image, language)

            texts.append(page_result['text'])
            confidences.append(page_result['confidence'])

            page_results.append({
                'page': i + 1,
                'text_length': len(page_result['text']),
                'confidence': round(page_result['confidence'], 2),
                'lines_count': page_result.get('lines_count', 0)
            })

            # Collect line data for table detection
            if 'lines' in page_result and isinstance(page_result['lines'], list):
                for line in page_result['lines']:
                    line['page'] = i + 1
                    all_lines.append(line)

        # Combine all pages
        full_text = '\n\n'.join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        result = {
            'text': full_text,
            'pages': len(images),
            'confidence': round(avg_confidence, 2),
            'method': f'{self.engine}_pdf',
            'language': language,
            'page_details': page_results,
            'text_length': len(full_text),
            'content_hash': self._compute_hash(content),
            'lines': all_lines,  # Include all lines with bounding boxes
            'preview_image': preview_image,  # Base64-encoded first page for highlighting overlay
            'preview_dimensions': preview_dimensions,  # Width/height for coordinate mapping
        }

        # Detect tables from line positions
        if self.table_detection and all_lines:
            tables = self._detect_tables_from_lines(all_lines)
            if tables:
                result['tables'] = tables

        return result

    def _process_image(
        self,
        content: bytes,
        language: str,
    ) -> Dict[str, Any]:
        """
        Process image file with preprocessing for better accuracy.

        Args:
            content: Image file content
            language: OCR language

        Returns:
            Extraction result
        """
        from PIL import Image

        # Open image
        image = Image.open(io.BytesIO(content))

        # Convert to RGB if necessary
        if image.mode not in ('L', 'RGB'):
            image = image.convert('RGB')

        logger.info(f"Processing image: {image.size}, mode: {image.mode}")

        # Apply preprocessing for better OCR accuracy
        if self.apply_preprocessing:
            image = self._preprocess_image_for_ocr(image)

        # Perform OCR
        if self._rapid_ocr:
            ocr_result = self._ocr_with_rapid(image, language)
        else:
            ocr_result = self._ocr_with_tesseract(image, language)

        result = {
            'text': ocr_result['text'],
            'pages': 1,
            'confidence': round(ocr_result['confidence'], 2),
            'method': f'{self.engine}_image',
            'language': language,
            'image_size': list(image.size),
            'text_length': len(ocr_result['text']),
            'content_hash': self._compute_hash(content),
            'lines': ocr_result.get('lines', []),  # Include lines with bounding boxes
        }

        # Include line count
        if 'lines' in ocr_result and isinstance(ocr_result['lines'], list):
            result['lines_count'] = len(ocr_result['lines'])

            # Detect tables
            if self.table_detection:
                tables = self._detect_tables_from_lines(ocr_result['lines'])
                if tables:
                    result['tables'] = tables

        return result

    def _preprocess_image_for_ocr(self, image) -> 'Image':
        """
        Preprocess image for better OCR accuracy.
        Optimized for CV/resume documents.

        Args:
            image: PIL Image

        Returns:
            Preprocessed image
        """
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps

        # Auto-orient based on EXIF data
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:
            pass

        # Convert to RGB for consistent processing
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Resize if image is too small (upscale for better OCR)
        min_dimension = 1000
        if min(image.size) < min_dimension:
            scale_factor = min_dimension / min(image.size)
            new_size = (int(image.size[0] * scale_factor), int(image.size[1] * scale_factor))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            logger.debug(f"Upscaled image to {new_size}")

        # Enhance contrast for better text visibility
        if self.contrast_factor != 1.0:
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(self.contrast_factor)

        # Enhance sharpness for clearer text edges
        if self.sharpness_factor != 1.0:
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(self.sharpness_factor)

        # Apply slight unsharp mask for text enhancement
        image = image.filter(ImageFilter.UnsharpMask(radius=1, percent=50, threshold=3))

        return image

    def _ocr_with_rapid(self, image, language: str) -> Dict[str, Any]:
        """
        Perform OCR using RapidOCR with optimized settings.

        Args:
            image: PIL Image object
            language: Language code (RapidOCR auto-detects)

        Returns:
            Dict with text, confidence, lines, and metadata
        """
        start_time = time.time()

        # Convert PIL Image to numpy array for RapidOCR
        img_array = np.array(image)

        # Run RapidOCR
        result, elapse = self._rapid_ocr(img_array)
        elapsed_seconds = time.time() - start_time

        logger.info(f"RapidOCR processing took {elapsed_seconds:.2f}s")

        # Handle empty result
        if not result or len(result) == 0:
            return {
                'text': '',
                'confidence': 0.0,
                'lines': [],
                'lines_count': 0,
            }

        # Extract text, confidence, and bounding boxes
        # RapidOCR returns: [[bbox, text, confidence], ...]
        lines = []
        texts = []
        confidences = []

        for item in result:
            bbox, text, conf = item[0], item[1], item[2]

            texts.append(text)
            confidences.append(float(conf))

            # Store line data with bounding box
            lines.append({
                'text': text,
                'confidence': float(conf) * 100,
                'bbox': bbox if isinstance(bbox, list) else bbox.tolist() if hasattr(bbox, 'tolist') else list(bbox),
            })

        # Join text with newlines (preserves document structure better)
        full_text = '\n'.join(texts)

        # Calculate average confidence (convert to percentage)
        avg_confidence = (sum(confidences) / len(confidences) * 100) if confidences else 0.0

        return {
            'text': full_text,
            'confidence': avg_confidence,
            'lines': lines,
            'lines_count': len(lines),
        }

    def _ocr_with_tesseract(self, image, language: str) -> Dict[str, Any]:
        """
        Perform OCR using Tesseract (fallback engine).

        Args:
            image: PIL Image object
            language: Language code

        Returns:
            Dict with text and confidence
        """
        import pytesseract

        # Map language to Tesseract code
        tess_lang = self.LANGUAGE_MAP.get(language, 'eng')

        # Apply additional preprocessing for Tesseract
        processed = self._preprocess_for_tesseract(image)

        # Get OCR data with confidence scores
        data = pytesseract.image_to_data(
            processed,
            lang=tess_lang,
            output_type=pytesseract.Output.DICT,
            config='--oem 3 --psm 3'  # Use LSTM engine with auto page segmentation
        )

        # Build text with structure preservation
        lines = []
        current_line = []
        current_line_num = -1

        for i, word in enumerate(data['text']):
            if not word.strip():
                continue

            line_num = data['line_num'][i]
            conf = data['conf'][i]

            if line_num != current_line_num and current_line:
                lines.append(' '.join(current_line))
                current_line = []

            current_line.append(word)
            current_line_num = line_num

        if current_line:
            lines.append(' '.join(current_line))

        full_text = '\n'.join(lines)

        # Calculate confidence
        conf_values = [int(c) for c in data['conf'] if str(c) != '-1' and c != '']
        confidence = sum(conf_values) / len(conf_values) if conf_values else 0.0

        return {
            'text': full_text,
            'confidence': confidence,
            'lines': [],
            'lines_count': len(lines),
        }

    def _preprocess_for_tesseract(self, image) -> 'Image':
        """
        Additional preprocessing specifically for Tesseract.

        Args:
            image: PIL Image

        Returns:
            Preprocessed grayscale image
        """
        from PIL import Image, ImageEnhance, ImageFilter

        # Convert to grayscale
        if image.mode == 'RGB':
            gray = image.convert('L')
        else:
            gray = image

        # Strong contrast enhancement
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(2.0)

        # Sharpen
        sharpened = enhanced.filter(ImageFilter.SHARPEN)

        return sharpened

    def _detect_tables_from_lines(self, lines: List[Dict]) -> List[Dict]:
        """
        Detect tables from OCR line data based on alignment patterns.

        Args:
            lines: List of OCR line data with bbox coordinates

        Returns:
            List of detected tables
        """
        if not lines or len(lines) < 3:
            return []

        tables = []

        # Group lines by vertical position (y-coordinate)
        y_groups = {}
        for line in lines:
            if 'bbox' not in line or not line['bbox']:
                continue

            bbox = line['bbox']
            # Handle different bbox formats
            if isinstance(bbox[0], (list, tuple)):
                # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] format
                y_center = (bbox[0][1] + bbox[2][1]) / 2
                x_start = bbox[0][0]
            else:
                # [x1, y1, x2, y2] format
                y_center = (bbox[1] + bbox[3]) / 2
                x_start = bbox[0]

            y_bucket = round(y_center / 25) * 25  # Group by ~25px bands
            if y_bucket not in y_groups:
                y_groups[y_bucket] = []
            y_groups[y_bucket].append({
                'text': line['text'],
                'x': x_start,
                'confidence': line.get('confidence', 0)
            })

        # Find rows with multiple columns (potential table rows)
        table_rows = []
        for y_pos in sorted(y_groups.keys()):
            row_items = y_groups[y_pos]
            if len(row_items) >= 2:  # At least 2 columns
                # Sort by x position
                sorted_items = sorted(row_items, key=lambda x: x['x'])
                table_rows.append({
                    'y': y_pos,
                    'cells': [item['text'] for item in sorted_items]
                })

        # Look for consecutive table-like rows
        if len(table_rows) >= 2:
            tables.append({
                'rows': [row['cells'] for row in table_rows],
                'row_count': len(table_rows),
                'col_count': max(len(row['cells']) for row in table_rows) if table_rows else 0
            })

        return tables

    def _compute_hash(self, content: bytes) -> str:
        """Compute SHA-256 hash of content."""
        return hashlib.sha256(content).hexdigest()

    @property
    def _ocr_available(self) -> bool:
        """Check if any OCR engine is available for processing."""
        return self._rapid_ocr is not None or self._tesseract_available

    def get_supported_formats(self) -> List[str]:
        """Get list of supported file formats."""
        return list(self.SUPPORTED_FORMATS.keys())

    def is_supported(self, file_type: str) -> bool:
        """Check if file type is supported."""
        return file_type.lower().replace('.', '') in self.SUPPORTED_FORMATS

    def get_engine_info(self) -> Dict[str, Any]:
        """
        Get information about the current OCR engine.

        Returns:
            Dict with engine information
        """
        return {
            "engine": self.engine,
            "default_language": self.default_language,
            "supported_languages": list(self.LANGUAGE_MAP.keys()),
            "table_detection": self.table_detection,
            "preprocessing_enabled": self.apply_preprocessing,
            "rapid_available": self._rapid_ocr is not None,
            "tesseract_available": self._tesseract_available,
            "ocr_available": self._ocr_available,
            "supported_formats": self.get_supported_formats(),
            "optimization_settings": {
                "det_db_thresh": self.det_db_thresh,
                "det_db_box_thresh": self.det_db_box_thresh,
                "det_db_unclip_ratio": self.det_db_unclip_ratio,
                "rec_batch_num": self.rec_batch_num,
                "contrast_factor": self.contrast_factor,
                "sharpness_factor": self.sharpness_factor,
            }
        }

    def get_available_languages(self) -> List[str]:
        """
        Get list of available languages.

        Returns:
            List of language codes
        """
        return ["en", "german", "turkish", "french", "spanish", "chinese", "japanese", "korean"]
