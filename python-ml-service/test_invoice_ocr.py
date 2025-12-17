"""
Test PaddleOCR on invoice images to verify output quality.
"""
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np

# Initialize PaddleOCR
print("Initializing PaddleOCR...")
ocr = PaddleOCR(lang='en')

# Test all three invoices
for i in range(1, 4):
    invoice_path = f"tests/fixtures/invoices/sample_invoice_{i}.png"
    print(f"\n{'='*60}")
    print(f"Processing: {invoice_path}")
    print('='*60)

    image = Image.open(invoice_path)
    img_array = np.array(image)

    # Run OCR
    result = ocr.ocr(img_array)

    if result and result[0]:
        rec_texts = result[0].get('rec_texts', [])
        rec_scores = result[0].get('rec_scores', [])

        print(f"\nExtracted {len(rec_texts)} text regions:")
        print("-" * 60)

        for j, text in enumerate(rec_texts):
            conf = rec_scores[j] if j < len(rec_scores) else 0.0
            print(f"{text:40} (confidence: {conf*100:.1f}%)")

        # Calculate average confidence
        avg_conf = (sum(rec_scores) / len(rec_scores) * 100) if rec_scores else 0.0
        print("-" * 60)
        print(f"Average confidence: {avg_conf:.1f}%")

        # Show full text
        full_text = ' '.join(rec_texts)
        print(f"\nFull text:\n{full_text}")
    else:
        print("No text detected")

print(f"\n{'='*60}")
print("COMPLETE")
print('='*60)
