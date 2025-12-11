/**
 * OCR Service Tests
 * Tests for PDF, DOCX, and Image OCR extraction
 */
'use strict';

const { OCRService } = require('../srv/handlers/ocr-service');
const fs = require('fs');
const path = require('path');

describe('OCR Service', () => {
    let ocrService;

    beforeAll(() => {
        ocrService = new OCRService();
    });

    describe('Initialization', () => {
        it('should initialize OCR service', async () => {
            await ocrService.initialize();
            expect(ocrService.initialized).toBe(true);
        });

        it('should not reinitialize if already initialized', async () => {
            await ocrService.initialize();
            await ocrService.initialize(); // Second call
            expect(ocrService.initialized).toBe(true);
        });
    });

    describe('PDF Text Extraction', () => {
        it('should extract text from a simple PDF', async () => {
            // Create a minimal PDF buffer
            const simplePdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Count 1
/Kids [3 0 R]
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test CV Content) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000361 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
456
%%EOF`;

            const pdfBuffer = Buffer.from(simplePdfContent, 'utf-8');

            const result = await ocrService._extractFromPDF(pdfBuffer);

            expect(result).toBeDefined();
            expect(result.text).toBeDefined();
            expect(result.pages).toBeGreaterThanOrEqual(1);
            expect(result.confidence).toBeGreaterThan(0);
        });

        it('should handle empty PDFs', async () => {
            const emptyPdf = Buffer.from('%PDF-1.4\n%%EOF', 'utf-8');

            const result = await ocrService._extractFromPDF(emptyPdf);

            expect(result.text.length).toBeLessThan(100);
            expect(result.isScanned).toBe(true);
        });

        it('should detect scanned PDFs', async () => {
            const scannedPdf = Buffer.from('%PDF-1.4\n%...minimal text...%%EOF', 'utf-8');

            const result = await ocrService._extractFromPDF(scannedPdf);

            expect(result.isScanned).toBe(true);
            expect(result.confidence).toBeLessThan(0.9);
        });

        it('should handle corrupted PDFs with fallback', async () => {
            const corruptedPdf = Buffer.from('This is not a real PDF but has some text content repeated many times to make it longer than 50 characters which is the minimum threshold');

            const result = await ocrService._extractFromPDF(corruptedPdf);

            expect(result.usedFallback).toBe(true);
            expect(result.text.length).toBeGreaterThan(0);
        });

        it('should throw error on completely invalid PDF', async () => {
            const invalidPdf = Buffer.from('invalid', 'utf-8');

            await expect(ocrService._extractFromPDF(invalidPdf))
                .rejects
                .toThrow('Failed to extract text from PDF');
        });
    });

    describe('DOCX Text Extraction', () => {
        it('should extract text from DOCX', async () => {
            // Create a minimal DOCX (ZIP file with XML)
            // For testing, we'll create a simple structure
            const docxBuffer = createMinimalDOCX('Test Resume Content\n\nJohn Doe\nSoftware Engineer');

            const result = await ocrService._extractFromDOCX(docxBuffer);

            expect(result).toBeDefined();
            expect(result.text).toContain('Test Resume');
            expect(result.confidence).toBeGreaterThan(0.9);
            expect(result.pages).toBe(1);
        });

        it('should handle empty DOCX', async () => {
            const emptyDocx = createMinimalDOCX('');

            const result = await ocrService._extractFromDOCX(emptyDocx);

            expect(result.text).toBe('');
            expect(result.confidence).toBeGreaterThan(0.9);
        });

        it('should report messages from DOCX extraction', async () => {
            const docxWithContent = createMinimalDOCX('Sample CV content');

            const result = await ocrService._extractFromDOCX(docxWithContent);

            expect(result.metadata).toBeDefined();
            expect(result.metadata.messages).toBeDefined();
        });

        it('should handle invalid DOCX', async () => {
            const invalidDocx = Buffer.from('not a valid docx file');

            await expect(ocrService._extractFromDOCX(invalidDocx))
                .rejects
                .toThrow('Failed to extract text from DOCX');
        });
    });

    describe('Image OCR Extraction', () => {
        it('should perform OCR on image', async () => {
            // Create a simple test image buffer (minimal PNG)
            const testImageBuffer = createTestImage();

            const result = await ocrService._extractFromImage(testImageBuffer);

            expect(result).toBeDefined();
            expect(result.text).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(result.metadata).toBeDefined();
            expect(result.metadata.processingTime).toBeGreaterThan(0);
        }, 30000); // OCR takes time

        it('should track OCR progress', async () => {
            const testImageBuffer = createTestImage();

            const result = await ocrService._extractFromImage(testImageBuffer);

            expect(result.metadata.words).toBeGreaterThanOrEqual(0);
            expect(result.metadata.lines).toBeGreaterThanOrEqual(0);
        }, 30000);

        it('should handle invalid images', async () => {
            const invalidImage = Buffer.from('not an image');

            await expect(ocrService._extractFromImage(invalidImage))
                .rejects
                .toThrow('Failed to perform OCR on image');
        }, 10000);
    });

    describe('Legacy DOC Extraction', () => {
        it('should warn about legacy DOC format', async () => {
            const docBuffer = Buffer.from('Sample DOC content that is long enough to pass basic extraction with lots of text');

            const result = await ocrService._extractFromDOC(docBuffer);

            expect(result.confidence).toBeLessThan(0.7);
            expect(result.warning).toContain('Legacy DOC format');
        });

        it('should recommend DOCX conversion', async () => {
            const shortDoc = Buffer.from('Short');

            await expect(ocrService._extractFromDOC(shortDoc))
                .rejects
                .toThrow('convert to DOCX');
        });
    });

    describe('Plain Text Extraction', () => {
        it('should extract plain text directly', async () => {
            const textBuffer = Buffer.from('Plain text resume content', 'utf-8');

            const result = await ocrService._extractFromText(textBuffer);

            expect(result.text).toBe('Plain text resume content');
            expect(result.confidence).toBe(1.0);
            expect(result.pages).toBe(1);
        });
    });

    describe('CV Data Extraction', () => {
        const sampleCVText = `
John Doe
john.doe@example.com
+1234567890
linkedin.com/in/johndoe
github.com/johndoe

PROFESSIONAL SUMMARY
Experienced software engineer with 5 years of experience in full-stack development.

WORK EXPERIENCE
Senior Developer at Tech Corp
2020 - Present
Led development of microservices architecture using Node.js and React.

Software Engineer at StartupXYZ
2018 - 2020
Developed web applications using JavaScript and Python.

EDUCATION
Bachelor of Computer Science - MIT
2014 - 2018

SKILLS
JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, Kubernetes

LANGUAGES
English (Native)
German (Intermediate)

CERTIFICATIONS
AWS Certified Solutions Architect
SAP Certified Development Associate
        `;

        it('should extract personal information', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.personalInfo.email).toBe('john.doe@example.com');
            expect(data.personalInfo.phone).toContain('1234567890');
            expect(data.personalInfo.linkedin).toContain('johndoe');
            expect(data.personalInfo.github).toContain('johndoe');
            expect(data.personalInfo.name).toContain('John Doe');
        });

        it('should extract work experience', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.experience.length).toBeGreaterThan(0);
            expect(data.experience[0].company).toContain('Tech Corp');
            expect(data.experience[0].title).toContain('Senior Developer');
        });

        it('should extract education', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.education.length).toBeGreaterThan(0);
            expect(data.education[0].degree).toContain('Bachelor');
            expect(data.education[0].institution).toContain('MIT');
        });

        it('should extract skills', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.skills.length).toBeGreaterThan(0);
            const skillNames = data.skills.map(s => s.name.toLowerCase());
            expect(skillNames).toContain('javascript');
            expect(skillNames).toContain('react');
            expect(skillNames).toContain('python');
        });

        it('should extract languages', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.languages.length).toBeGreaterThan(0);
            expect(data.languages[0].language).toBe('English');
            expect(data.languages[0].level).toContain('Native');
        });

        it('should extract certifications', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.certifications.length).toBeGreaterThan(0);
            const certNames = data.certifications.map(c => c.name);
            expect(certNames.some(name => name.includes('AWS'))).toBe(true);
            expect(certNames.some(name => name.includes('SAP'))).toBe(true);
        });

        it('should calculate confidence score', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.extractionConfidence).toBeGreaterThan(0);
            expect(data.extractionConfidence).toBeLessThanOrEqual(100);
        });

        it('should include raw text', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.rawText).toBe(sampleCVText);
        });

        it('should include extraction timestamp', async () => {
            const data = await ocrService.extractCVData(sampleCVText);

            expect(data.extractedAt).toBeDefined();
            expect(new Date(data.extractedAt).getTime()).toBeGreaterThan(0);
        });
    });

    describe('Full Document Processing', () => {
        it('should process document end-to-end', async () => {
            const pdfContent = '%PDF-1.4\n% Simple PDF with text content that includes skills like JavaScript and React\n%%EOF';
            const pdfBuffer = Buffer.from(pdfContent);

            const result = await ocrService.processDocument(
                pdfBuffer,
                'application/pdf',
                { enrichSkills: true }
            );

            expect(result.success).toBe(true);
            expect(result.extractedData).toBeDefined();
            expect(result.metadata).toBeDefined();
            expect(result.metadata.pageCount).toBeGreaterThanOrEqual(1);
            expect(result.metadata.processingTime).toBeDefined();
        });

        it('should optionally skip skill enrichment', async () => {
            const textBuffer = Buffer.from('Simple text', 'utf-8');

            const result = await ocrService.processDocument(
                textBuffer,
                'text/plain',
                { enrichSkills: false }
            );

            expect(result.success).toBe(true);
        });

        it('should reject unsupported file types', async () => {
            const buffer = Buffer.from('test');

            await expect(ocrService.extractText(buffer, 'application/exe'))
                .rejects
                .toThrow('Unsupported file type');
        });
    });

    describe('Skill Pattern Detection', () => {
        it('should detect programming languages', async () => {
            const text = 'Skills: JavaScript, Python, Java, C++, TypeScript';
            const data = await ocrService.extractCVData(text);

            const skillNames = data.skills.map(s => s.name);
            expect(skillNames).toContain('JavaScript');
            expect(skillNames).toContain('Python');
            expect(skillNames).toContain('Java');
        });

        it('should detect frameworks', async () => {
            const text = 'Proficient in React, Angular, Vue.js, Node.js, Django';
            const data = await ocrService.extractCVData(text);

            const skillNames = data.skills.map(s => s.name);
            expect(skillNames).toContain('React');
            expect(skillNames).toContain('Angular');
        });

        it('should detect databases', async () => {
            const text = 'Database experience: MySQL, PostgreSQL, MongoDB, Redis';
            const data = await ocrService.extractCVData(text);

            const skillNames = data.skills.map(s => s.name);
            expect(skillNames).toContain('MySQL');
            expect(skillNames).toContain('PostgreSQL');
        });

        it('should detect cloud technologies', async () => {
            const text = 'Cloud: AWS, Azure, Kubernetes, Docker';
            const data = await ocrService.extractCVData(text);

            const skillNames = data.skills.map(s => s.name);
            expect(skillNames).toContain('AWS');
            expect(skillNames).toContain('Kubernetes');
        });

        it('should detect SAP technologies', async () => {
            const text = 'SAP HANA, SAP BTP, SAP CAP, SAP Fiori, SAPUI5';
            const data = await ocrService.extractCVData(text);

            const skillNames = data.skills.map(s => s.name);
            expect(skillNames.some(name => name.includes('SAP'))).toBe(true);
        });
    });
});

// Helper functions for creating test data

function createMinimalDOCX(textContent) {
    // Create a minimal valid DOCX structure (ZIP with document.xml)
    // This is a simplified version - in real tests you might use a library
    const JSZip = require('jszip');
    const zip = new JSZip();

    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${textContent}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    zip.file('word/document.xml', documentXml);
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);

    return zip.generateAsync({ type: 'nodebuffer' });
}

function createTestImage() {
    // Create a minimal PNG image (1x1 transparent pixel)
    const png = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // Width: 1
        0x00, 0x00, 0x00, 0x01, // Height: 1
        0x08, 0x06, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
        0x1F, 0x15, 0xC4, 0x89, // CRC
        0x00, 0x00, 0x00, 0x0A, // IDAT length
        0x49, 0x44, 0x41, 0x54, // IDAT
        0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
        0x0D, 0x0A, 0x2D, 0xB4, // IDAT data + CRC
        0x00, 0x00, 0x00, 0x00, // IEND length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // CRC
    ]);

    return png;
}
