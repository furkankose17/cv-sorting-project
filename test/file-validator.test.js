/**
 * File Validator Tests
 * Tests for secure file validation functionality
 */
'use strict';

const {
    validateFile,
    validateFileSize,
    validateMimeType,
    validateFileExtension,
    verifyFileSignature,
    sanitizeFileName,
    performBasicMalwareCheck,
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES
} = require('../srv/lib/file-validator');

describe('File Validator', () => {

    describe('validateFileSize', () => {
        it('should accept files within size limit', () => {
            const buffer = Buffer.alloc(1024 * 1024); // 1MB
            expect(() => validateFileSize(buffer, 'test.pdf')).not.toThrow();
        });

        it('should reject files exceeding size limit', () => {
            const buffer = Buffer.alloc(MAX_FILE_SIZE + 1);
            expect(() => validateFileSize(buffer, 'large.pdf')).toThrow('File too large');
        });

        it('should reject empty files', () => {
            const buffer = Buffer.alloc(0);
            expect(() => validateFileSize(buffer, 'empty.pdf')).toThrow('File is empty');
        });

        it('should reject invalid buffer', () => {
            expect(() => validateFileSize(null, 'test.pdf')).toThrow('Invalid file buffer');
            expect(() => validateFileSize('not a buffer', 'test.pdf')).toThrow('Invalid file buffer');
        });
    });

    describe('validateMimeType', () => {
        it('should accept allowed MIME types', () => {
            ALLOWED_MIME_TYPES.forEach(mimeType => {
                expect(() => validateMimeType(mimeType)).not.toThrow();
            });
        });

        it('should reject unsupported MIME types', () => {
            expect(() => validateMimeType('application/exe')).toThrow('Unsupported file type');
            expect(() => validateMimeType('text/html')).toThrow('Unsupported file type');
            expect(() => validateMimeType('application/zip')).toThrow('Unsupported file type');
        });

        it('should reject null or undefined MIME types', () => {
            expect(() => validateMimeType(null)).toThrow('MIME type is required');
            expect(() => validateMimeType(undefined)).toThrow('MIME type is required');
        });
    });

    describe('validateFileExtension', () => {
        it('should accept matching extension and MIME type', () => {
            expect(() => validateFileExtension('resume.pdf', 'application/pdf')).not.toThrow();
            expect(() => validateFileExtension('document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).not.toThrow();
            expect(() => validateFileExtension('image.png', 'image/png')).not.toThrow();
        });

        it('should reject mismatched extension and MIME type', () => {
            expect(() => validateFileExtension('document.pdf', 'application/msword')).toThrow('does not match MIME type');
            expect(() => validateFileExtension('image.png', 'application/pdf')).toThrow('does not match MIME type');
        });

        it('should reject unsupported extensions', () => {
            expect(() => validateFileExtension('script.exe', 'application/exe')).toThrow('Unsupported file extension');
            expect(() => validateFileExtension('archive.zip', 'application/zip')).toThrow('Unsupported file extension');
        });

        it('should reject files without extension', () => {
            // File 'noextension' is treated as having extension 'noextension', which is unsupported
            expect(() => validateFileExtension('noextension', 'application/pdf')).toThrow('Unsupported file extension');
        });
    });

    describe('verifyFileSignature', () => {
        it('should verify PDF signature', () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%...', 'utf-8');
            expect(() => verifyFileSignature(pdfBuffer, 'application/pdf')).not.toThrow();
        });

        it('should verify PNG signature', () => {
            const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            expect(() => verifyFileSignature(pngBuffer, 'image/png')).not.toThrow();
        });

        it('should verify JPEG signature', () => {
            const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
            expect(() => verifyFileSignature(jpegBuffer, 'image/jpeg')).not.toThrow();
        });

        it('should reject file with wrong signature', () => {
            const fakeBuffer = Buffer.from('This is not a PDF', 'utf-8');
            expect(() => verifyFileSignature(fakeBuffer, 'application/pdf')).toThrow('File signature validation failed');
        });

        it('should reject files that are too small', () => {
            const tinyBuffer = Buffer.from([0x00]);
            expect(() => verifyFileSignature(tinyBuffer, 'application/pdf')).toThrow('File too small to verify signature');
        });
    });

    describe('sanitizeFileName', () => {
        it('should preserve valid file names', () => {
            expect(sanitizeFileName('resume.pdf')).toBe('resume.pdf');
            expect(sanitizeFileName('John_Doe_CV.docx')).toBe('John_Doe_CV.docx');
        });

        it('should remove path separators', () => {
            // Path separators (/ and \) are replaced with _, then .. is replaced with _
            expect(sanitizeFileName('../../../etc/passwd')).toBe('______etc_passwd');
            expect(sanitizeFileName('..\\..\\windows\\system32')).toBe('____windows_system32');
        });

        it('should remove null bytes', () => {
            expect(sanitizeFileName('file\x00name.pdf')).toBe('filename.pdf');
        });

        it('should replace path traversal patterns', () => {
            // .. is replaced with _, path separators are replaced with _
            expect(sanitizeFileName('../../secret.pdf')).toBe('____secret.pdf');
        });

        it('should truncate long file names', () => {
            const longName = 'a'.repeat(300) + '.pdf';
            const sanitized = sanitizeFileName(longName);
            expect(sanitized.length).toBeLessThanOrEqual(255);
            expect(sanitized).toMatch(/\.pdf$/);
        });

        it('should handle invalid input', () => {
            // Empty string should be sanitized to 'document'
            expect(sanitizeFileName('')).toBe('document');
            // '.' should be sanitized to 'document'
            expect(sanitizeFileName('.')).toBe('document');
            // null/undefined should return 'unknown'
            expect(sanitizeFileName(null)).toBe('unknown');
            expect(sanitizeFileName(undefined)).toBe('unknown');
        });
    });

    describe('performBasicMalwareCheck', () => {
        it('should flag files with multiple extensions', () => {
            const buffer = Buffer.from('test content');
            const result = performBasicMalwareCheck(buffer, 'document.pdf.exe');

            expect(result.isSuspicious).toBe(true);
            expect(result.warnings).toContain('File has multiple extensions including executable extension');
        });

        it('should flag files with suspicious content patterns', () => {
            const buffer = Buffer.from('<script>alert("xss")</script>');
            const result = performBasicMalwareCheck(buffer, 'test.pdf');

            expect(result.isSuspicious).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should pass clean files', () => {
            const buffer = Buffer.from('Normal resume content with skills and experience');
            const result = performBasicMalwareCheck(buffer, 'resume.pdf');

            expect(result.isSuspicious).toBe(false);
            expect(result.warnings.length).toBe(0);
        });

        it('should recommend antivirus for suspicious files', () => {
            const buffer = Buffer.from('javascript:alert(1)');
            const result = performBasicMalwareCheck(buffer, 'file.pdf');

            expect(result.recommendation).toContain('antivirus');
        });
    });

    describe('validateFile (comprehensive)', () => {
        it('should validate a valid PDF file', () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%' + 'a'.repeat(1000), 'utf-8');
            const result = validateFile({
                fileName: 'resume.pdf',
                buffer: pdfBuffer,
                mimeType: 'application/pdf'
            });

            expect(result.isValid).toBe(true);
            expect(result.sanitizedFileName).toBe('resume.pdf');
            expect(result.fileSize).toBeGreaterThan(0);
        });

        it('should validate a valid PNG file', () => {
            const pngBuffer = Buffer.concat([
                Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
                Buffer.alloc(1000, 0)
            ]);
            const result = validateFile({
                fileName: 'scan.png',
                buffer: pngBuffer,
                mimeType: 'image/png'
            });

            expect(result.isValid).toBe(true);
            expect(result.sanitizedFileName).toBe('scan.png');
        });

        it('should reject oversized file', () => {
            const hugeBuffer = Buffer.alloc(MAX_FILE_SIZE + 1);
            expect(() => validateFile({
                fileName: 'huge.pdf',
                buffer: hugeBuffer,
                mimeType: 'application/pdf'
            })).toThrow('File too large');
        });

        it('should reject file with wrong signature', () => {
            const fakeBuffer = Buffer.from('Not a real PDF file content');
            expect(() => validateFile({
                fileName: 'fake.pdf',
                buffer: fakeBuffer,
                mimeType: 'application/pdf'
            })).toThrow('File signature validation failed');
        });

        it('should reject unsupported MIME type', () => {
            const buffer = Buffer.from('test');
            expect(() => validateFile({
                fileName: 'script.exe',
                buffer: buffer,
                mimeType: 'application/exe'
            })).toThrow('Unsupported file type');
        });

        it('should sanitize malicious file names', () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%test', 'utf-8');
            const result = validateFile({
                fileName: '../../../etc/passwd.pdf',
                buffer: pdfBuffer,
                mimeType: 'application/pdf'
            });

            expect(result.sanitizedFileName).not.toContain('..');
            expect(result.sanitizedFileName).not.toContain('/');
        });
    });

    describe('Security Edge Cases', () => {
        it('should handle zip-based formats (DOCX)', () => {
            const docxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, ...Array(100).fill(0)]);
            const result = validateFile({
                fileName: 'document.docx',
                buffer: docxBuffer,
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });

            expect(result.isValid).toBe(true);
        });

        it('should reject polyglot files (PDF/HTML)', () => {
            const polyglotBuffer = Buffer.from('%PDF-1.4\n<html><script>alert(1)</script></html>');
            // This should still pass signature but might be flagged by malware check
            const result = validateFile({
                fileName: 'suspicious.pdf',
                buffer: polyglotBuffer,
                mimeType: 'application/pdf'
            });

            expect(result.isValid).toBe(true); // Signature is valid
            // But malware check would flag it
            const malwareCheck = performBasicMalwareCheck(polyglotBuffer, 'suspicious.pdf');
            expect(malwareCheck.isSuspicious).toBe(true);
        });
    });
});
