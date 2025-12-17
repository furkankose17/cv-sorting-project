"""
Debug script to test PaddleOCR directly and see result structure.
"""
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np
import json

# Initialize PaddleOCR
ocr = PaddleOCR(lang='en')

# Load test invoice
invoice_path = "tests/fixtures/invoices/sample_invoice_1.png"
image = Image.open(invoice_path)
img_array = np.array(image)

print(f"Image shape: {img_array.shape}")
print(f"Image dtype: {img_array.dtype}")

# Run OCR
result = ocr.ocr(img_array)

print("\n=== RAW RESULT ===")
print(f"Result type: {type(result)}")
print(f"Result: {result}")

print("\n=== RESULT STRUCTURE ===")
if result:
    print(f"Len result: {len(result)}")
    if result[0]:
        print(f"Len result[0]: {len(result[0])}")
        if len(result[0]) > 0:
            print(f"\nFirst line:")
            print(f"Type: {type(result[0][0])}")
            print(f"Content: {result[0][0]}")
