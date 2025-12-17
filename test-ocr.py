#!/usr/bin/env python3
"""
Simple OCR test script to verify the OCR functionality works
"""
import base64
import requests
from PIL import Image, ImageDraw, ImageFont
import io

# Create a simple test image with text
def create_test_image():
    """Create a simple image with text for OCR testing"""
    img = Image.new('RGB', (800, 400), color='white')
    d = ImageDraw.Draw(img)

    # Try to use a default font, fall back to default if not available
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
    except:
        font = ImageFont.load_default()

    # Add some text
    text = """John Doe
Senior Software Engineer
Email: john.doe@example.com
Phone: +1-555-123-4567

SKILLS:
Python, JavaScript, Java, React, Node.js
Machine Learning, OCR, NLP

EXPERIENCE:
5 years in software development
Expert in full-stack development"""

    d.multiline_text((50, 50), text, fill='black', font=font)

    # Save to bytes
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr = img_byte_arr.getvalue()

    return img_byte_arr

# Test the OCR endpoint
def test_ocr():
    """Test the OCR processing endpoint"""
    print("Creating test image...")
    img_bytes = create_test_image()

    # Encode to base64
    img_base64 = base64.b64encode(img_bytes).decode('utf-8')

    print("Sending to OCR endpoint...")
    url = "http://localhost:8000/api/ocr/process"

    payload = {
        "file_content": img_base64,
        "file_type": "png",
        "language": "eng",
        "extract_structured": True
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()

        result = response.json()

        print("\n" + "="*80)
        print("OCR TEST RESULTS")
        print("="*80)
        print(f"\nStatus: SUCCESS")
        print(f"Confidence: {result.get('confidence', 0):.2f}%")
        print(f"Processing Time: {result.get('processing_time_ms', 0):.2f}ms")
        print(f"\nExtracted Text ({len(result.get('text', ''))} chars):")
        print("-" * 80)
        print(result.get('text', ''))
        print("-" * 80)

        if 'structured_data' in result:
            sd = result['structured_data']
            print(f"\nStructured Data Extraction:")
            print(f"  Emails: {sd.get('personal_info', {}).get('email', [])}")
            print(f"  Phones: {sd.get('personal_info', {}).get('phone', [])}")
            print(f"  Skills: {sd.get('skills', [])}")
            print(f"  Languages: {sd.get('languages', [])}")

        print("\n" + "="*80)
        print("✓ OCR FUNCTIONALITY IS WORKING")
        print("="*80)
        return True

    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to ML service at http://localhost:8000")
        print("   Make sure the Python ML service is running.")
        return False
    except requests.exceptions.HTTPError as e:
        print(f"\n❌ ERROR: HTTP {e.response.status_code}")
        print(f"   Response: {e.response.text}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_ocr()
    exit(0 if success else 1)
