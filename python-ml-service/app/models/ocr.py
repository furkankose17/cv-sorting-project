"""
OCR Processor for CV Sorting ML Service.
Uses RapidOCR as primary engine with Tesseract as fallback.
Supports multilingual OCR (EN, DE, TR, FR, ES) with table detection.
"""

import io
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import hashlib

logger = logging.getLogger(__name__)


class OCRProcessor:
    """
    OCR processor using RapidOCR (primary) or Tesseract (fallback).
    Supports PDF, PNG, JPG, TIFF, and other image formats.

    RapidOCR advantages:
    - 3-5x faster than PaddleOCR on CPU
    - Excellent handling of both clean and scanned documents
    - Built-in multilingual support (EN, DE, TR, FR, ES, etc.)
    - Lower memory footprint (~500MB vs 2GB+)
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

    # Language mapping: PaddleOCR uses different codes
    PADDLE_LANG_MAP = {
        'en': 'en',
        'eng': 'en',
        'german': 'german',
        'deu': 'german',
        'de': 'german',
        'turkish': 'tr',  # PaddleOCR uses 'tr' for Turkish
        'tur': 'tr',
        'tr': 'tr',
        'french': 'fr',
        'fra': 'fr',
        'fr': 'fr',
        'spanish': 'es',
        'spa': 'es',
        'es': 'es',
    }

    # Tesseract language codes (for fallback)
    TESSERACT_LANG_MAP = {
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
        use_angle_cls: bool = True,
        table_detection: bool = True,
        layout_analysis: bool = True
    ):
        """
        Initialize OCR processor.

        Args:
            engine: OCR engine to use ('rapidocr', 'paddleocr', or 'tesseract')
            tesseract_cmd: Path to tesseract executable
            poppler_path: Path to poppler binaries (for PDF conversion)
            default_language: Default OCR language
            use_angle_cls: Whether to use angle classification
            table_detection: Whether to enable table detection
            layout_analysis: Whether to enable layout analysis
        """
        self.engine = engine or os.getenv("OCR_ENGINE", "rapidocr")
        self.default_language = default_language
        self.poppler_path = poppler_path
        self.use_angle_cls = use_angle_cls
        self.table_detection = table_detection
        self.layout_analysis = layout_analysis

        self._paddle_ocr = None
        self._rapid_ocr = None
        self._tesseract_available = False

        # Initialize based on engine selection
        if self.engine == "rapidocr":
            self._init_rapidocr()
        elif self.engine == "paddleocr":
            self._init_paddleocr()
        else:
            self._init_tesseract(tesseract_cmd)

    def _init_paddleocr(self):
        """Initialize PaddleOCR engine (v3.x compatible)."""
        try:
            from paddleocr import PaddleOCR

            paddle_lang = self.PADDLE_LANG_MAP.get(self.default_language, 'en')
            logger.info(f"Initializing PaddleOCR 3.x with language: {paddle_lang}")

            # PaddleOCR 3.x simplified initialization
            self._paddle_ocr = PaddleOCR(lang=paddle_lang)
            logger.info("PaddleOCR 3.x initialized successfully")
        except ImportError:
            logger.warning("PaddleOCR not available, falling back to Tesseract")
            self.engine = "tesseract"
            self._init_tesseract(None)
        except Exception as e:
            logger.warning(f"PaddleOCR initialization failed: {e}, falling back to Tesseract")
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

    def _init_rapidocr(self):
        """Initialize RapidOCR engine."""
        try:
            from rapidocr_onnxruntime import RapidOCR

            logger.info("Initializing RapidOCR...")
            self._rapid_ocr = RapidOCR()
            logger.info("RapidOCR initialized successfully")
        except ImportError:
            logger.warning("RapidOCR not available, falling back to Tesseract")
            self.engine = "tesseract"
            self._init_tesseract(None)
        except Exception as e:
            logger.warning(f"RapidOCR initialization failed: {e}, falling back to Tesseract")
            self.engine = "tesseract"
            self._init_tesseract(None)

    def extract_text(
        self,
        file_content: bytes,
        file_type: str,
        language: Optional[str] = None,
        engine: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract text from a document.

        Args:
            file_content: Binary file content
            file_type: File type (pdf, png, jpg, etc.)
            language: OCR language code (en, german, turkish, etc.)
            engine: Override OCR engine ('rapidocr', 'paddleocr', or 'tesseract')

        Returns:
            Dict with extracted text, confidence, and metadata
        """
        file_type = file_type.lower().replace('.', '')
        language = language or self.default_language
        use_engine = engine or self.engine

        if file_type not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported file type: {file_type}. Supported: {list(self.SUPPORTED_FORMATS.keys())}")

        logger.info(f"Processing {file_type} file with language: {language}, engine: {use_engine}")

        if file_type == 'pdf':
            return self._process_pdf(file_content, language, use_engine)
        else:
            return self._process_image(file_content, language, use_engine)

    def _process_pdf(
        self,
        content: bytes,
        language: str,
        use_engine: str
    ) -> Dict[str, Any]:
        """
        Process PDF document.

        Args:
            content: PDF file content
            language: OCR language
            use_engine: OCR engine to use

        Returns:
            Extraction result
        """
        from pdf2image import convert_from_bytes

        logger.info("Converting PDF to images...")

        try:
            # Convert PDF to images
            images = convert_from_bytes(
                content,
                poppler_path=self.poppler_path,
                dpi=150,  # Balanced DPI for speed and quality
                fmt='png'
            )
        except Exception as e:
            logger.error(f"PDF conversion failed: {e}")
            # Try even lower DPI
            images = convert_from_bytes(
                content,
                poppler_path=self.poppler_path,
                dpi=100,
                fmt='png'
            )

        logger.info(f"PDF has {len(images)} pages")

        texts = []
        confidences = []
        page_results = []
        tables = []

        for i, image in enumerate(images):
            logger.debug(f"Processing page {i + 1}/{len(images)}")

            if use_engine == "rapidocr" and self._rapid_ocr:
                page_result = self._ocr_with_rapid(image, language)
            elif use_engine == "paddleocr" and self._paddle_ocr:
                page_result = self._ocr_with_paddle(image, language)
            else:
                page_result = self._ocr_with_tesseract(image, language)

            texts.append(page_result['text'])
            confidences.append(page_result['confidence'])

            page_results.append({
                'page': i + 1,
                'text_length': len(page_result['text']),
                'confidence': round(page_result['confidence'], 2)
            })

            # Collect tables if detected
            if 'tables' in page_result and page_result['tables']:
                for table in page_result['tables']:
                    table['page'] = i + 1
                    tables.append(table)

        # Combine all pages
        full_text = '\n\n'.join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        result = {
            'text': full_text,
            'pages': len(images),
            'confidence': round(avg_confidence, 2),
            'method': f'{use_engine}_pdf',
            'language': language,
            'page_details': page_results,
            'text_length': len(full_text),
            'content_hash': self._compute_hash(content)
        }

        if tables:
            result['tables'] = tables

        return result

    def _process_image(
        self,
        content: bytes,
        language: str,
        use_engine: str
    ) -> Dict[str, Any]:
        """
        Process image file.

        Args:
            content: Image file content
            language: OCR language
            use_engine: OCR engine to use

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

        # Perform OCR based on engine
        if use_engine == "rapidocr" and self._rapid_ocr:
            ocr_result = self._ocr_with_rapid(image, language)
        elif use_engine == "paddleocr" and self._paddle_ocr:
            ocr_result = self._ocr_with_paddle(image, language)
        else:
            # Preprocess image for Tesseract
            image = self._preprocess_image(image)
            ocr_result = self._ocr_with_tesseract(image, language)

        result = {
            'text': ocr_result['text'],
            'pages': 1,
            'confidence': round(ocr_result['confidence'], 2),
            'method': f'{use_engine}_image',
            'language': language,
            'image_size': list(image.size),
            'text_length': len(ocr_result['text']),
            'content_hash': self._compute_hash(content)
        }

        if 'tables' in ocr_result and ocr_result['tables']:
            result['tables'] = ocr_result['tables']

        return result

    def _ocr_with_paddle(self, image, language: str) -> Dict[str, Any]:
        """
        Perform OCR using PaddleOCR 3.x.

        Args:
            image: PIL Image object
            language: Language code

        Returns:
            Dict with text, confidence, and optional tables
        """
        import numpy as np
        from PIL import Image
        import tempfile
        import os

        # Convert PIL Image to numpy array or save to temp file
        # PaddleOCR 3.x requires file path or numpy array
        if isinstance(image, Image.Image):
            # Save to temp file for PaddleOCR 3.x
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                image.save(tmp.name)
                temp_path = tmp.name

            try:
                # Run PaddleOCR 3.x with .predict()
                result = self._paddle_ocr.predict(temp_path)
            finally:
                # Clean up temp file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
        else:
            # If already numpy array, save to temp file
            img = Image.fromarray(image) if isinstance(image, np.ndarray) else image
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                img.save(tmp.name)
                temp_path = tmp.name

            try:
                result = self._paddle_ocr.predict(temp_path)
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

        if not result or len(result) == 0:
            return {'text': '', 'confidence': 0.0, 'lines': [], 'tables': []}

        # Extract from PaddleOCR 3.x result format
        page_result = result[0]
        rec_texts = page_result.get('rec_texts', [])
        rec_scores = page_result.get('rec_scores', [])
        rec_polys = page_result.get('rec_polys', [])

        # Extract text and confidence
        texts = []
        confidences = []
        line_data = []

        for i, text in enumerate(rec_texts):
            conf = rec_scores[i] if i < len(rec_scores) else 0.9
            bbox = rec_polys[i] if i < len(rec_polys) else []

            texts.append(text)
            confidences.append(float(conf))
            line_data.append({
                'text': text,
                'confidence': float(conf),
                'bbox': bbox.tolist() if hasattr(bbox, 'tolist') else bbox
            })

        full_text = ' '.join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        result_dict = {
            'text': full_text,
            'confidence': avg_confidence * 100,  # Convert to percentage
            'lines': line_data,
            'tables': []
        }

        # Attempt table detection if enabled
        if self.table_detection:
            tables = self._detect_tables_from_lines(line_data)
            if tables:
                result_dict['tables'] = tables

        return result_dict

    def _ocr_with_tesseract(self, image, language: str) -> Dict[str, Any]:
        """
        Perform OCR using Tesseract.

        Args:
            image: PIL Image object
            language: Language code

        Returns:
            Dict with text and confidence
        """
        import pytesseract

        # Map language to Tesseract code
        tess_lang = self.TESSERACT_LANG_MAP.get(language, 'eng')

        # Get OCR data with confidence scores
        data = pytesseract.image_to_data(
            image,
            lang=tess_lang,
            output_type=pytesseract.Output.DICT
        )

        # Extract text
        text = ' '.join([
            word for word in data['text']
            if word.strip()
        ])

        # Calculate confidence
        conf_values = [
            int(c) for c in data['conf']
            if str(c) != '-1' and c != ''
        ]
        confidence = sum(conf_values) / len(conf_values) if conf_values else 0.0

        return {
            'text': text,
            'confidence': confidence,
            'tables': []
        }

    def _ocr_with_rapid(self, image, language: str) -> Dict[str, Any]:
        """
        Perform OCR using RapidOCR.

        Args:
            image: PIL Image object
            language: Language code (not used by RapidOCR - auto-detects)

        Returns:
            Dict with text, confidence, and optional tables
        """
        import time

        # RapidOCR accepts PIL Image directly
        start_time = time.time()
        result, elapse = self._rapid_ocr(image)
        elapsed_seconds = time.time() - start_time

        logger.info(f"RapidOCR processing took {elapsed_seconds:.2f}s (lib reported: {elapse}ms)")

        # result format: [[bbox, text, confidence], ...] or None
        if not result or len(result) == 0:
            return {'text': '', 'confidence': 0.0, 'lines': [], 'tables': []}

        # Extract text and confidence
        texts = [item[1] for item in result]
        confidences = [item[2] for item in result]

        full_text = '\n'.join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        return {
            'text': full_text,
            'confidence': avg_confidence * 100,  # Convert to percentage
            'lines': len(texts),
            'tables': []
        }

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

        # Simple heuristic: detect aligned text blocks
        # This is a basic implementation - can be enhanced
        tables = []

        # Group lines by vertical position (y-coordinate)
        y_groups = {}
        for line in lines:
            if 'bbox' in line and len(line['bbox']) >= 4:
                y_center = (line['bbox'][0][1] + line['bbox'][2][1]) / 2
                y_bucket = round(y_center / 20) * 20  # Group by ~20px bands
                if y_bucket not in y_groups:
                    y_groups[y_bucket] = []
                y_groups[y_bucket].append(line)

        # Find rows with multiple columns (potential table rows)
        table_rows = []
        for y_pos in sorted(y_groups.keys()):
            if len(y_groups[y_pos]) >= 2:  # At least 2 columns
                table_rows.append({
                    'y': y_pos,
                    'cells': [l['text'] for l in sorted(
                        y_groups[y_pos],
                        key=lambda x: x['bbox'][0][0] if 'bbox' in x else 0
                    )]
                })

        # If we have consecutive table-like rows, mark as a table
        if len(table_rows) >= 2:
            tables.append({
                'rows': [row['cells'] for row in table_rows],
                'row_count': len(table_rows),
                'col_count': max(len(row['cells']) for row in table_rows) if table_rows else 0
            })

        return tables

    def _preprocess_image(self, image) -> 'Image':
        """
        Preprocess image for better OCR results.

        Args:
            image: PIL Image

        Returns:
            Preprocessed image
        """
        from PIL import Image, ImageEnhance, ImageFilter

        # Convert to grayscale for text
        if image.mode == 'RGB':
            gray = image.convert('L')
        else:
            gray = image

        # Enhance contrast
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.5)

        # Optional: sharpen
        sharpened = enhanced.filter(ImageFilter.SHARPEN)

        return sharpened

    def extract_structured_data(
        self,
        text: str
    ) -> Dict[str, Any]:
        """
        Extract structured data from CV text.
        Identifies sections like experience, education, skills, etc.

        Args:
            text: Extracted text from CV

        Returns:
            Structured data dict
        """
        import re

        result = {
            'personal_info': {},
            'skills': [],
            'experience': [],
            'education': [],
            'languages': [],
            'certifications': [],
            'summary': None,
            'raw_text': text
        }

        # Extract email
        email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
        emails = re.findall(email_pattern, text)
        if emails:
            result['personal_info']['email'] = emails[0]

        # Extract phone
        phone_patterns = [
            r'\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}',
            r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}',
        ]
        for pattern in phone_patterns:
            phones = re.findall(pattern, text)
            if phones:
                result['personal_info']['phone'] = phones[0]
                break

        # Extract LinkedIn
        linkedin_pattern = r'linkedin\.com/in/[\w-]+'
        linkedin = re.findall(linkedin_pattern, text, re.IGNORECASE)
        if linkedin:
            result['personal_info']['linkedin'] = f"https://{linkedin[0]}"

        # Extract skills using common patterns
        skill_patterns = [
            r'python', r'javascript', r'typescript', r'java', r'c\+\+', r'c#',
            r'react', r'angular', r'vue', r'node\.?js', r'express',
            r'sql', r'mysql', r'postgresql', r'mongodb', r'redis',
            r'aws', r'azure', r'gcp', r'docker', r'kubernetes',
            r'sap', r'abap', r'fiori', r'ui5', r'hana', r'btp', r'cap',
            r'git', r'jenkins', r'ci/cd', r'agile', r'scrum',
            r'machine learning', r'deep learning', r'nlp', r'tensorflow', r'pytorch'
        ]

        text_lower = text.lower()
        for pattern in skill_patterns:
            if re.search(pattern, text_lower):
                # Capitalize properly
                skill = pattern.replace(r'\.?', '.').replace(r'\+\+', '++')
                result['skills'].append(skill)

        # Extract languages
        language_patterns = [
            (r'english', 'English'),
            (r'german|deutsch', 'German'),
            (r'turkish|türkçe', 'Turkish'),
            (r'french|français', 'French'),
            (r'spanish|español', 'Spanish'),
        ]
        for pattern, lang in language_patterns:
            if re.search(pattern, text_lower):
                result['languages'].append(lang)

        return result

    def _compute_hash(self, content: bytes) -> str:
        """Compute SHA-256 hash of content."""
        return hashlib.sha256(content).hexdigest()

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
        info = {
            "engine": self.engine,
            "default_language": self.default_language,
            "supported_languages": list(self.PADDLE_LANG_MAP.keys()) if self.engine in ["paddleocr", "rapidocr"] else list(self.TESSERACT_LANG_MAP.keys()),
            "table_detection": self.table_detection,
            "layout_analysis": self.layout_analysis,
            "angle_classification": self.use_angle_cls,
            "rapid_available": self._rapid_ocr is not None,
            "paddle_available": self._paddle_ocr is not None,
            "tesseract_available": self._tesseract_available,
            "supported_formats": self.get_supported_formats()
        }
        return info

    def get_available_languages(self) -> List[str]:
        """
        Get list of available languages for the current engine.

        Returns:
            List of language codes
        """
        if self.engine in ["paddleocr", "rapidocr"]:
            return ["en", "german", "turkish", "french", "spanish", "chinese", "japanese", "korean"]
        else:
            return ["eng", "deu", "tur", "fra", "spa"]

    def switch_engine(self, engine: str):
        """
        Switch OCR engine at runtime.

        Args:
            engine: New engine ('rapidocr', 'paddleocr', or 'tesseract')
        """
        if engine not in ["rapidocr", "paddleocr", "tesseract"]:
            raise ValueError(f"Invalid engine: {engine}. Must be 'rapidocr', 'paddleocr', or 'tesseract'")

        if engine == "rapidocr" and self._rapid_ocr is None:
            self._init_rapidocr()
        elif engine == "paddleocr" and self._paddle_ocr is None:
            self._init_paddleocr()
        elif engine == "tesseract" and not self._tesseract_available:
            self._init_tesseract(None)

        self.engine = engine
        logger.info(f"OCR engine switched to: {engine}")
